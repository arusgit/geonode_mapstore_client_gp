
import Rx from 'rxjs';

import {
    RESET_CONTROLS,
    SET_CONTROL_PROPERTIES,
    SET_CONTROL_PROPERTY,
    TOGGLE_CONTROL
} from "../../../actions/controls";
import { info, error } from '../../../actions/notifications';

import { updateAdditionalLayer, removeAdditionalLayer } from '../../../actions/additionallayers';
import {CLICK_ON_MAP, registerEventListener, unRegisterEventListener} from '../../../actions/map';


import {hideMapinfoMarker, changeMapInfoState} from '../../../actions/mapInfo';
import { mapInfoEnabledSelector } from "../../../selectors/mapInfo";

import { CONTROL_NAME, MARKER_LAYER_ID, STREET_VIEW_OWNER, STREET_VIEW_DATA_LAYER_ID } from "../constants";
import {
    streetViewProviderSelector,
    currentProviderApiLoadedSelector,
    enabledSelector,
    getStreetViewMarkerLayer,
    getStreetViewDataLayer,
    locationSelector,
    povSelector,
    useStreetViewDataLayerSelector,
    streetViewDataLayerSelector
} from "../selectors/streetView";
import {setLocation, SET_LOCATION, SET_POV, UPDATE_STREET_VIEW_LAYER } from '../actions/streetView';
import API from '../api';
import {shutdownToolOnAnotherToolDrawing} from "../../../utils/ControlUtils";

const getNavigationArrowSVG = function({rotation = 0}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" xml:space="preserve">
		<g transform="translate(50,50) scale(2)">
            <circle style="stroke: #a5ff91; stroke-width: 2; fill: #5bA640; fill-opacity:0.6; opacity: 1;" vector-effect="non-scaling-stroke" cx="0" cy="0" r="13"/>
        </g>
        <g transform="translate(50,50) scale(2) rotate(${rotation})">
            <polygon style="stroke: #a5ff91; stroke-width: 2; fill: #228D4F; fill-opacity:1; opacity: 1;" vector-effect="non-scaling-stroke" points="0,-12 5,-5 0,-8 -5,-5 "/>
        </g>
        <g transform="translate(50,50) translate(0,-5) scale(1.5)">
            <circle style="stroke: #3100aa; stroke-width: 2; fill: #037dff; fill-opacity:1; opacity: 1;" vector-effect="non-scaling-stroke" cx="0" cy="0" r="3"/>
        </g>
        <g transform="translate(50,50) scale(2) translate(5,5) rotate(180)">
            <path d="M0,0 a1,1 0 0,0 10,0" style="stroke: #3100aa; stroke-width: 2; fill: #037dff; fill-opacity:1; opacity: 1;" vector-effect="non-scaling-stroke"/>
        </g>
</svg>`;
};

/**
 * Intercept on `TOGGLE_CONTROL` of street-view component
 * to deactivate and clean up mapInfo and restore it on panel close.
 * @param {external:Observable} action$ manages `TOGGLE_CONTROL`
 * @param getState
 * @return {external:Observable}
 */
export const disableGFIForStreetViewEpic = (action$, { getState = () => { } }) =>
    action$
        .ofType(TOGGLE_CONTROL, SET_CONTROL_PROPERTY, SET_CONTROL_PROPERTIES)
        .filter(({control}) => control === CONTROL_NAME)
        // if the enable event happens when the mapInfo is active
        .filter(() => enabledSelector(getState()))
        .switchMap(() => {
            // deactivate feature info
            return Rx.Observable.of(hideMapinfoMarker(),
                changeMapInfoState(false) // always disable feature info
            ).merge(
                // restore feature info on close
                action$.ofType(TOGGLE_CONTROL, SET_CONTROL_PROPERTY, SET_CONTROL_PROPERTIES)
                    .filter(({control}) => control === CONTROL_NAME)
                    .take(1)
                    .filter(() => !enabledSelector(getState()))
                    .filter(() => !mapInfoEnabledSelector(getState()))
                    .mapTo(changeMapInfoState(true))
                    .takeUntil(action$.ofType(RESET_CONTROLS))
            );
        });
/**
 * Intercept street view open/close event. Adds / Removes the additional layer from the map
 * @param {external:Observable} action$ manages `TOGGLE_CONTROL`
 * @param getState
 * @return {external:Observable}
 */
export const streetViewSetupTearDown = (action$, {getState = ()=>{}}) =>
    action$
        .ofType(TOGGLE_CONTROL, SET_CONTROL_PROPERTY, SET_CONTROL_PROPERTIES)
        .filter(({control}) => control === CONTROL_NAME)
        .filter(() => enabledSelector(getState()))
        .switchMap(() => {
            // setup
            return Rx.Observable.from([
                registerEventListener('click', CONTROL_NAME),
                ...(useStreetViewDataLayerSelector(getState())
                    ? [updateAdditionalLayer(
                        STREET_VIEW_DATA_LAYER_ID,
                        STREET_VIEW_OWNER,
                        'overlay',
                        {
                            id: STREET_VIEW_DATA_LAYER_ID,
                            name: STREET_VIEW_DATA_LAYER_ID,
                            visibility: true,
                            ...streetViewDataLayerSelector(getState())

                        })]
                    : []
                ),
                updateAdditionalLayer(
                    MARKER_LAYER_ID,
                    STREET_VIEW_OWNER,
                    'overlay',
                    {
                        id: MARKER_LAYER_ID,
                        type: "vector",
                        name: MARKER_LAYER_ID,
                        visibility: true

                    })
            ]).concat(
                // tear down
                action$
                    .ofType(TOGGLE_CONTROL, SET_CONTROL_PROPERTY, SET_CONTROL_PROPERTIES)
                    .filter(({control}) => control === CONTROL_NAME)
                    .filter(() => !enabledSelector(getState()))
                    .merge(action$.ofType(RESET_CONTROLS))
                    .take(1)
                    .switchMap(() => {
                        return  Rx.Observable.from([
                            unRegisterEventListener('click', CONTROL_NAME),
                            ...(useStreetViewDataLayerSelector(getState()) ? [removeAdditionalLayer({id: STREET_VIEW_DATA_LAYER_ID, owner: STREET_VIEW_OWNER})] : []),
                            removeAdditionalLayer({id: MARKER_LAYER_ID, owner: STREET_VIEW_OWNER})
                        ]);
                    })
            );
        });
/**
 * Intercept street view Click events to retrieve location info from street view API and update
 * the state.
 * @param {external:Observable} action$ manages `CLICK_ON_MAP` when the street-view tool is active
 * @param getState
 * @return {external:Observable}
 */
export const streetViewMapClickHandler = (action$, {getState = () => {}}) => {
    return action$.ofType(CLICK_ON_MAP)
        .filter(() => enabledSelector(getState()))
        .filter(() => currentProviderApiLoadedSelector(getState()))
        .switchMap(({point}) => {
            const provider = streetViewProviderSelector(getState());
            const getLocation = API[provider]?.getLocation;
            if (!getLocation) {
                return Rx.Observable.of(
                    error({title: "streetView.title", message: "streetView.messages.providerNotSupported"})
                );
            }
            return Rx.Observable
                .defer(() => getLocation(point))
                .map(setLocation)
                .catch((e) => {
                    if (e.code === "ZERO_RESULTS") {
                        return Rx.Observable.of(
                            info({title: "streetView.title", message: "streetView.messages.noDataForPosition"})
                        );
                    }
                    console.error(e); //
                    return Rx.Observable.of(
                        error({title: "streetView.title", message: "streetView.messages.unknownError"})
                    );
                });
        });
};
/**
 * On location update events updates the map layer.
 * the state.
 * @param {external:Observable} action$ manages `SET_LOCATION`, `UPDATE_STREET_VIEW_LAYER`
 * @param getState
 * @return {external:Observable}
 */
export const streetViewSyncLayer = (action$, {getState = () => {}}) => {


    const locationToFeature = (location, pov) => {
        const {lat, lng} = location?.latLng;
        return {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [lng, lat],
                crs: "EPSG:4326"
            },
            style: [{
                iconAnchor: [0.5, 0.5],
                anchorXUnits: "fraction",
                anchorYUnits: "fraction",
                opacity: 1,
                size: 100,
                symbolUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(getNavigationArrowSVG({rotation: pov?.heading})),
                shape: "triangle",
                id: "c65cadc0-9b46-11ea-a138-dd5f1faf9a0d",
                highlight: false,
                weight: 4
            }]
        };
    };
    return action$.ofType(SET_LOCATION, SET_POV).switchMap(() => {
        const state = getState();
        const location = locationSelector(state);
        const pov = povSelector(state);
        if (!location) {
            return Rx.Observable.empty();
        }
        return Rx.Observable.of(locationToFeature(location, pov)).map((feature) => {
            const options = getStreetViewMarkerLayer(getState());
            return updateAdditionalLayer(
                MARKER_LAYER_ID,
                STREET_VIEW_OWNER,
                "overlay", {...options, features: [feature]}
            );
        });
    })
        .merge(action$.ofType(UPDATE_STREET_VIEW_LAYER).switchMap(({updates = {}}) => {
            const options = getStreetViewDataLayer(getState());
            return Rx.Observable.of(updateAdditionalLayer(
                STREET_VIEW_DATA_LAYER_ID,
                STREET_VIEW_OWNER,
                'overlay',
                {...options, ...updates}));
        }));
};

/**
 * Closes street-view tool when one of the drawing tools takes control
 * @param action$
 * @param store
 * @returns {Observable<unknown>}
 */
export const tearDownStreetViewOnDrawToolActive = (action$, store) => shutdownToolOnAnotherToolDrawing(action$, store, CONTROL_NAME);
