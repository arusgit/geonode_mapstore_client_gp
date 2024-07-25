/*
 * Copyright 2017, GeoSolutions Sas.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Layers from '../../../../utils/cesium/Layers';
import * as Cesium from 'cesium';
import GeoServerBILTerrainProvider from '../../../../utils/cesium/GeoServerBILTerrainProvider';
import { isEqual } from 'lodash';
import WMSUtils from '../../../../utils/cesium/WMSUtils';
import {roundRangeResolution,getStartEndDomainValues,domainsToDimensionsObject} from '../../../../utils/TimeUtils'
import MultiDim from '../../../../api/MultiDim';
import  'rxjs/add/operator/first';
import  'rxjs/add/operator/switchMap';
import {reprojectBbox} from '../../../../utils/CoordinatesUtils';
const Bboxlayers= new Map();

/*
function to manage interval like 2016-02-23T03:00:00.000Z/2016-02-23T06:00:00.000Z,2016-02-23T06:00:00.000Z/2016-02-23T12:00:00.000Z 
if you specify End attibute in layer with time dimesion
*/
const extractValuesBeforeSlash = (inputString) => {
    // Split the string by commas to get each interval
    const intervals = inputString.split(',');

    // Map through each interval and split by '/' to extract the value before '/'
    const valuesBeforeSlash = intervals.map(interval => interval.split('/')[0]);

    return valuesBeforeSlash;
};
const createLayer =  async (options,map) => {
    let layer;
   
    if (options.useForElevation) {
        return new GeoServerBILTerrainProvider(WMSUtils.wmsToCesiumOptionsBIL(options));
    }
    if (options.singleTile) {
        layer = new Cesium.SingleTileImageryProvider(WMSUtils.wmsToCesiumOptionsSingleTile(options));
    } else {
        var  hasTimeDimension = false;
        if (options.group!=='background'){
            if (options.dimensions!=null && options.dimensions.length>0){
                hasTimeDimension = options.dimensions.some(dim => dim.name === "time");
                if (!hasTimeDimension){
                    layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                }else {
                
                    return await getLayerFromObservable();
            
                }
            } else {
                // potrebbe essere che sto aggiungendo il layer nella scena 3d quindi faccio una request per sapere
                // se il layer contiene la dimensione time in quanto options.dimension è null
                return  new Promise((resolve,reject) => { MultiDim.describeDomains(MultiDim.getMultidimURL(options), options.name)
                    .switchMap( domains => {
                        const dimensions = domainsToDimensionsObject(domains,MultiDim.getMultidimURL(options)) || [];
                        if (dimensions && dimensions.length > 0) {
                            hasTimeDimension = dimensions.some( dim => dim.name==="time")
                            if (hasTimeDimension){
                                const result =dimensions.filter( dim => dim.name==="time");
                                const space = dimensions.filter( dim => dim.name==="space");
                                if (result && result.length){
                                    const dataRange = getStartEndDomainValues(result[0].domain);
                                    const layer = setInitDataLayer(dataRange,map,result[0]);
                                    Bboxlayers.set(options.name, space[0].domain);
                                    resolve(layer);
                                }
                            } else {
                                layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                                resolve(layer);
                            }
                        } else {
                            layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                            resolve(layer);
                        }
                    
                    })                    
                    .subscribe({
                        error: error => reject(error)
                    });
                });
            }
            
        } else {
            layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
        }
        
    }

    layer.updateParams = (params) => {
        const newOptions = {
            ...options,
            params: {
                ...(options.params || {}),
                ...params
            }
        };
        return createLayer(newOptions);
    };
    return layer;
    
    async function  getLayerFromObservable() {
        return await new Promise((resolve,reject) => {
                MultiDim.describeDomains(MultiDim.getMultidimURL(options),options.name,
                options.dimensions[0].name)
                .first().subscribe(result => {
                Bboxlayers.set(options.name, result.Domains.SpaceDomain.BoundingBox);
                console.log("load layer "+options.name);
                const dataRange = getStartEndDomainValues(result.Domains.DimensionDomain.Domain);
                const layer = setInitDataLayer(dataRange,map,result.Domains.DimensionDomain);
               
                resolve(layer);
            },reject) })
         
       
    }
    function setInitDataLayer(dataRange,map,domain) {
        const initialRange = {start: new Date(dataRange[0]), end: new Date(dataRange[1] || dataRange[0])};
        const clock = createCeisumClock( initialRange,map);
        const clockViewModel = new Cesium.ClockViewModel(clock);
        const viewModel = new Cesium.AnimationViewModel(clockViewModel);
        let domainValues;
        if ( domain.Domain && domain.Domain.indexOf('--') < 0){
            domainValues  = extractValuesBeforeSlash(domain.Domain);
           //  domainValues = domain.Domain && domain.Domain.indexOf('--') < 0
             
        } else {
            if (domain.Domain && domain.Domain.indexOf('--') < 0){
                 domainValues  = extractValuesBeforeSlash(domain.domain);
            }
        } 
        
        var times;
        if (domainValues.length>0){
             
             times= new Cesium.TimeIntervalCollection.fromIso8601DateArray({
                iso8601Dates :domainValues,
                leadingInterval: true,
                trailingInterval: true,
                isStopIncluded: false, // We want stop time to be part of the trailing interval
                dataCallback: dataCallback,
            });
        } else {
            
            const {range, resolution} = roundRangeResolution(initialRange,20);
            times = Cesium.TimeIntervalCollection.fromIso8601({
            iso8601: range.start.toISOString()+"/"+range.end.toISOString()+"/"+resolution,
            leadingInterval: true,
            trailingInterval: true,
            isStopIncluded: false, // We want stop time to be part of the trailing interval
            dataCallback: dataCallback,
            }); 
        }
         //create Timeline Widget
         createTimeLineWidget(clock,map,domainValues.length>0 ? domainValues:times_intervals.map(item => item.data.Time));
         //create Animation Widget 
         createAnimationWidget(viewModel,map);
        // Ensure the scene re-renders on each tick
        
        const layer = new Cesium.WebMapServiceImageryProvider(
            {
                url: options.url,
                layers: options.name,
                style: "default",
                parameters: {
                    "transparent": "true",
                    "format": options.format,
                },
                clock: clock,
                times: times,
                credit: "Almaviva"
            }
            
        )  
              
        layer.updateParams = (params) => {
            const newOptions = {
                ...options,
                params: {
                    ...(options.params || {}),
                    ...params
                }
            };
            return createLayer(newOptions);
        };
      
      
        return layer;
    }
    function createTimeLineWidget(clock,map,domainValues) {
        const cesiumContainer = document.getElementsByClassName(map.cesiumWidget.container.className)[0];
         // Get the width of the Cesium container
        const cesiumContainerWidth = cesiumContainer.offsetWidth;

        // Create and append timeline container
        var timelineContainer = document.getElementById('timelineContainer');
        if (timelineContainer!==undefined && timelineContainer == null) {
             timelineContainer = document.createElement('div');
            timelineContainer.id = 'timelineContainer';
            timelineContainer.style.position = 'absolute';
            timelineContainer.style.bottom = '35px';
            timelineContainer.style.left = '340px';
            //timelineContainer.className='timeline-plugin';
            // Set the width of the timeline container to 80% of the Cesium container width
            timelineContainer.style.width = cesiumContainerWidth * 0.77 + "px";

            timelineContainer.style.height = '50px';
            document.getElementsByClassName(map.cesiumWidget.container.className)[0].appendChild(timelineContainer);
        }
        var timeline = new Cesium.Timeline(timelineContainer, clock);
        const julianDates = domainValues.map(dateStr => Cesium.JulianDate.fromIso8601(dateStr));
        
        timeline.resize();
        timeline.addEventListener('settime', function (e) {
            clock.currentTime = e.timeJulian;
            
        }, false);
      
       
       
        addCustomBookmarks(timelineContainer,julianDates,clock,options.id,map);
       
        timeline.zoomTo(clock.startTime, clock.stopTime);
        timeline.updateFromClock();
        return timelineContainer;
    }

   

    function createAnimationWidget(viewModel,map) {
        var animationContainer = document.getElementById('animationContainer');
        if (animationContainer!==undefined && animationContainer == null) {
            animationContainer = document.createElement('div');
            animationContainer.id = 'animationContainer';
            animationContainer.style.position = 'absolute';
            animationContainer.style.bottom = '35px';
            animationContainer.style.left = '120px';
            animationContainer.style.width = '200px';
            animationContainer.style.height = '122px';
            document.getElementsByClassName(map.cesiumWidget.container.className)[0].appendChild(animationContainer);
        }
        // Add Animation
        const animationWidget = new Cesium.Animation(animationContainer, viewModel);
    }

   
    
};

const updateLayer = (layer, newOptions, oldOptions,map) => {
    const requiresUpdate = (el) => WMSUtils.PARAM_OPTIONS.indexOf(el.toLowerCase()) >= 0;
    const newParams = newOptions && newOptions.params;
    const oldParams = oldOptions && oldOptions.params;
    const allParams = {...newParams, ...oldParams };
    let newParameters = Object.keys({...newOptions, ...oldOptions, ...allParams})
        .filter(requiresUpdate)
        .filter((key) => {
            const oldOption = oldOptions[key] === undefined ? oldParams && oldParams[key] : oldOptions[key];
            const newOption = newOptions[key] === undefined ? newParams && newParams[key] : newOptions[key];
            return !isEqual(oldOption, newOption);
        });
    if (newParameters.length > 0 ||
        newOptions.securityToken !== oldOptions.securityToken ||
        !isEqual(newOptions.layerFilter, oldOptions.layerFilter) ||
        newOptions.tileSize !== oldOptions.tileSize) {
        return createLayer(newOptions);
    }
    if (newOptions.visibility != oldOptions.visibility){
        const timelineContainer = document.getElementById('timelineContainer');
        if (newOptions.visibility){
            if (layer._timeDynamicImagery!==undefined && layer._timeDynamicImagery._times._intervals !== null){
                setVisibilityTimeLine('visible',layer);
                const TimeintervalsjulianDates = layer._timeDynamicImagery._times._intervals;
                const julianDates = buildJulianDates(TimeintervalsjulianDates);
                addCustomBookmarks(timelineContainer,julianDates,map.clock,newOptions.id,map)
            } 
        } else {
            /* Start Business logic to hidden o remove timeline */
            if (layer._timeDynamicImagery !==undefined &&             
                layer._timeDynamicImagery._times._intervals !== null && 
                layer._timeDynamicImagery._times._intervals.length>0){
                const visibleLayers = map.imageryLayers._layers.filter(layer => layer.show);
                
                removeBookmark( layer,newOptions.id);
              
                var foundwWmsWithTimeline= false;
                visibleLayers.forEach(layer => {
                        const wmsProvider = layer.imageryProvider;
                    
                        if (layer != wmsProvider  && wmsProvider._timeDynamicImagery !==  undefined
                            &&  wmsProvider._timeDynamicImagery._times !=null 
                            && wmsProvider._timeDynamicImagery._times._intervals 
                            && wmsProvider._timeDynamicImagery._times._intervals.length>0
                        ){
                            foundwWmsWithTimeline=true;
                        }
                    
                })
                if (!foundwWmsWithTimeline) {
                    setVisibilityTimeLine('hidden',layer);
                } 
                
            }
        /* End Business logic to hidden  timeline */
        }
       
    }
    return null;
};

function buildJulianDates(TimeintervalsjulianDates) {
    const julianDates = [];
    TimeintervalsjulianDates.forEach(timeinterval => {
        const julianDate = Cesium.JulianDate.fromIso8601(timeinterval.data.Time);
        julianDates.push(julianDate);
    });
    return julianDates;
}

function setVisibilityTimeLine(visibility) {
    const timelineContainer = document.getElementById('timelineContainer');
    if (timelineContainer !== null) {
        timelineContainer.style.visibility = visibility;


    }
    const animationContainer = document.getElementById('animationContainer');
    if (animationContainer !== null) {
        animationContainer.style.visibility = visibility;

    }
    
    

}
function createCeisumClock( initialRange,map) {
    const clock = map.clock;
    const starttime = Cesium.JulianDate.fromDate(initialRange.start);
    const stopTime = Cesium.JulianDate.fromDate(initialRange.end);
    clock.startTime =Cesium.JulianDate.compare(clock.startTime ,starttime)<=0 ? clock.startTime :starttime  ;
    clock.currentTime = Cesium.JulianDate.compare(clock.startTime ,starttime)<=0 ? clock.startTime :starttime  ;
    clock.stopTime = Cesium.JulianDate.compare(clock.stopTime ,stopTime)<=0 ? stopTime : clock.stopTime;
    clock.clockRange = Cesium.ClockRange.CLAMPED;
    clock.clockStep = Cesium.ClockStep.TICK_DEPENDENT;
    clock.multiplier = 1800;
    return clock;
}

function dataCallback(interval, index) {
    let time;
    if (index === 0) {
      // leading
      time = Cesium.JulianDate.toIso8601(interval.stop);
    } else {
      time = Cesium.JulianDate.toIso8601(interval.start);
    }
  
    return {
      Time: time,
    };
  }

  function removeBookmark(layer, id) {
    document.querySelectorAll('.bookmark').forEach(el => {
        if (el.id.includes(id))
            el.remove()
    });
   
}

function addCustomBookmarks(timelineContainer,julianDates,clock,id,map) {
   
   var i=0;
   julianDates.forEach(julianDate => {
       const gregorianDate = Cesium.JulianDate.toDate(julianDate);

       const bookmarkElement = document.createElement('div');
       bookmarkElement.className = 'bookmark';

       // Calculate the left position of the bookmark based on the timeline's start and stop times
       const totalDuration = Cesium.JulianDate.secondsDifference(clock.stopTime, clock.startTime);
       const tickOffset = Cesium.JulianDate.secondsDifference(julianDate, clock.startTime);
       const tickPosition = (tickOffset / totalDuration) * timelineContainer.clientWidth;
       bookmarkElement.id =id+"-"+i;
       bookmarkElement.style.left = `${tickPosition}px`;
       bookmarkElement.style.bottom = `10px`;
       const match = id.match(/geonode:(.*?)__/);
       const extractedWord = match ? match[1] : null;
       bookmarkElement.title=extractedWord+" to " +Cesium.JulianDate.toIso8601(julianDate)
        // Add click event listener to move to the specific date
        bookmarkElement.addEventListener('click', (e) => {
            clock.currentTime = julianDate;
            clock.shouldAnimate = false; 
            const layer = map.scene.imageryLayers._layers.find(l =>  e.currentTarget.id.includes(l._imageryProvider.layerId?l._imageryProvider.layerId:l._imageryProvider._layers));
            if (layer) {           
                const layername = layer._imageryProvider._layers
                const sourcecrs =Bboxlayers.get(layername).CRS;
                const { minx, miny, maxx, maxy } = Bboxlayers.get(layername);
                const bounds = reprojectBbox([minx, miny, maxx, maxy], sourcecrs, "EPSG:4326");
                const rectangle = Cesium.Rectangle.fromDegrees(parseFloat(bounds[0]), parseFloat(bounds[1]), parseFloat(bounds[2]), parseFloat(bounds[3]));
                map.camera.flyTo({destination:rectangle});   
                map.scene.requestRender();  
            }              
            
        });
       
       

       timelineContainer.appendChild(bookmarkElement);
       i++;
    });
    
    
}
  
Layers.registerType('wms', {create: createLayer, update: updateLayer});
