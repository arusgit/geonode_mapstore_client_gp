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
import WMSUtils, { wmsToCesiumOptions } from '../../../../utils/cesium/WMSUtils';
import {roundRangeResolution, getStartEndDomainValues, domainsToDimensionsObject} from '../../../../utils/TimeUtils'
import MultiDim from '../../../../api/MultiDim';
import  'rxjs/add/operator/first';
import  'rxjs/add/operator/switchMap';
import {reprojectBbox} from '../../../../utils/CoordinatesUtils';
const Bboxlayers = new Map();
var bookmarks = []; // Store bookmark elements for later updates
var timeline; // timeline in timelinecontainer
var wheelHandler;
var cloneclock;
const selectedlayerKey = 'selectedlayer';
const selectedDateKey = 'selectedDate';
const storageKey = 'layerDates';
let layerDates = [];
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

const createLayer = async (options,map) => {
    let layer;
   
    var  hasTimeDimension = false;
    if (options.useForElevation) {
        return new GeoServerBILTerrainProvider(WMSUtils.wmsToCesiumOptionsBIL(options));
    }
    if ( options.dimensions && options.dimensions !== null && options.dimensions.length > 0) {
        hasTimeDimension = options.dimensions.some(dim => dim.name === "time");
        if (!hasTimeDimension){
            removeDropdownContainer();
        }
    }
    
    if (options.singleTile) {
        
        if (map._cesiumWidget._scene._defaultView.camera._mode === Cesium.SceneMode.SCENE3D) {
            // reset timeline an remove bookmark
           
            if (options.dimensions !== undefined  && options.dimensions.length > 0) {
                hasTimeDimension = options.dimensions.some(dim => dim.name === "time");
                if (!hasTimeDimension){
                    const newCesiumOptions = setSingleTileParameters(options);
                    layer = new Cesium.WebMapServiceImageryProvider( WMSUtils.wmsToCesiumOptions(newCesiumOptions));
                } else {
                  
                   return await getLayerFromObservable();          
                }
            } else {
                return  new Promise((resolve,reject) => { 
                    MultiDim.describeDomains(MultiDim.getMultidimURL(options), options.name)
                    .switchMap( domains => {
                        const dimensions = domainsToDimensionsObject(domains , MultiDim.getMultidimURL(options)) || [];
                        if (dimensions && dimensions.length > 0) {
                            hasTimeDimension = dimensions.some( dim => dim.name === "time")
                            if (hasTimeDimension){
                                const result =dimensions.filter( dim => dim.name === "time");
                                const space = dimensions.filter( dim => dim.name === "space");
                                if (result && result.length){
                                    const dataRange = getStartEndDomainValues(result[0].domain);
                                    const layer = setInitDataLayer(dataRange,map,result[0]);
                                    Bboxlayers.set(options.name, space[0].domain);
                                    resolve(layer);
                                }
                            } else {
                                if (!options.singleTile){
                                    layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                                } else {
                                    layer = buildSingleTileLayer(options);
                                }
                                resolve(layer);
                            }
                        } else {
                            if (!options.singleTile){
                                layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                            } else {
                                layer = buildSingleTileLayer(options);
                            }
                            resolve(layer);
                        }
                    
                    })                    
                    .subscribe({
                        error: error => reject(error)
                    });
                });
            }
            
        } else {
            layer = new Cesium.SingleTileImageryProvider(WMSUtils.wmsToCesiumOptionsSingleTile(options));
        }
    } else {
        
        if (options.group !== 'background'){
            if (options.dimensions !== null && options.dimensions.length > 0) {
                hasTimeDimension = options.dimensions.some(dim => dim.name === "time");
                if (!hasTimeDimension){
                    layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                } else {
                   return await getLayerFromObservable();          
                }
            } else {
                // potrebbe essere che sto aggiungendo il layer nella scena 3d quindi faccio una request per sapere
                // se il layer contiene la dimensione time in quanto options.dimension è null
                return  new Promise((resolve,reject) => { MultiDim.describeDomains(MultiDim.getMultidimURL(options), options.name)
                    .switchMap( domains => {
                        const dimensions = domainsToDimensionsObject(domains , MultiDim.getMultidimURL(options)) || [];
                        if (dimensions && dimensions.length > 0) {
                            hasTimeDimension = dimensions.some( dim => dim.name === "time")
                            if (hasTimeDimension){
                                const result =dimensions.filter( dim => dim.name === "time");
                                const space = dimensions.filter( dim => dim.name === "space");
                                if (result && result.length){
                                    const dataRange = getStartEndDomainValues(result[0].domain);
                                    const layer = setInitDataLayer(dataRange,map,result[0]);
                                    Bboxlayers.set(options.name, space[0].domain);
                                    resolve(layer);
                                }
                            } else {
                                if (options.singleTile == true){
                                    layer = buildSingleTileLayer(options);
                                } else {
                                    layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                                }
                                resolve(layer);
                            }
                        } else {
                            if (options.singleTile == true){
                                layer = buildSingleTileLayer(options);
                            } else {
                                layer = new Cesium.WebMapServiceImageryProvider(WMSUtils.wmsToCesiumOptions(options));
                            }
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
        return createLayer(newOptions,map);
    };
    return layer;
    
    function setSingleTileParameters(options) {
        const rectangle = Cesium.Rectangle.fromDegrees(
            parseFloat(options.bbox.bounds.minx), // west (longitude)
            parseFloat(options.bbox.bounds.miny), // south (latitude)
            parseFloat(options.bbox.bounds.maxx), // east (longitude)
            parseFloat(options.bbox.bounds.maxy) // north (latitude)
        );
        var singleTileTilingScheme = new Cesium.GeographicTilingScheme({
            rectangle: rectangle, // get the BBOX of the named layer
            numberOfLevelZeroTilesX: 1,
            numberOfLevelZeroTilesY: 1
        });
        options.tiled = false;
        var parameters = {
            styles: options.styles !== undefined ? options.styles : "",
            transparent: options.transparent !== undefined ? options.transparent : true,
            opacity: options.opacity !== undefined ? options.opacity : 1,
        };
        options.parameters = parameters;
        const newCesiumOptions = {
            ...options,
            rectangle: rectangle,
            tilingScheme: singleTileTilingScheme,
            tileWidth: 2048, // Optional: Define tile width, typically 256 or 512
            tileHeight: 1024, // Optional: Define tile height, typically 256 or 512
            minimumLevel: 0, // Ensure we start at the lowest level (0)
            maximumLevel: 0,
        };
        return newCesiumOptions;
    }

    async function getLayerFromObservable() {
        return await new Promise((resolve, reject) => {
            MultiDim.describeDomains(MultiDim.getMultidimURL(options), options.name,
                options.dimensions[0].name)
                .first().subscribe(result => {
                    Bboxlayers.set(options.name, result.Domains.SpaceDomain.BoundingBox);
                    console.log("load layer " + options.name);
                    const dataRange = getStartEndDomainValues(result.Domains.DimensionDomain.Domain);
                    const layer = setInitDataLayer(dataRange, map, result.Domains.DimensionDomain);

                    resolve(layer);
                }, reject)
        })


    }
    function setInitDataLayer(dataRange, map, domain) {
        const initialRange = { start: new Date(dataRange[0]), end: new Date(dataRange[1] || dataRange[0]) };
        const clock = createCeisumClock(initialRange, map);
        cloneclock = { ...clock };
        const clockViewModel = new Cesium.ClockViewModel(clock);
        const viewModel = new Cesium.AnimationViewModel(clockViewModel);
        let domainValues;
        if (domain.Domain && domain.Domain.indexOf('--') < 0) {
            domainValues = extractValuesBeforeSlash(domain.Domain);

        } else {
            if (domain.domain && domain.domain.indexOf('--') < 0) {
                domainValues = extractValuesBeforeSlash(domain.domain);
            }
        }

        var times;
        if (domainValues && domainValues.length > 0) {

            times = new Cesium.TimeIntervalCollection.fromIso8601DateArray({
                iso8601Dates: domainValues,
                leadingInterval: true,
                trailingInterval: true,
                isStopIncluded: false, // We want stop time to be part of the trailing interval
                dataCallback: dataCallback,
            });
        } else {

            const { range, resolution } = roundRangeResolution(initialRange, 20);
            times = Cesium.TimeIntervalCollection.fromIso8601({
                iso8601: range.start.toISOString() + "/" + range.end.toISOString() + "/" + resolution,
                leadingInterval: true,
                trailingInterval: true,
                isStopIncluded: false, // We want stop time to be part of the trailing interval
                dataCallback: dataCallback,
            });
        }
        //create Timeline Widget
        createTimeLineWidget(clock, map, domainValues && domainValues.length > 0 ? domainValues : times._intervals.map(item => item.data.Time));
        //create Animation Widget 
        createAnimationWidget(viewModel, map);
        var layer ;
        options.credits="Almaviva";
        if (options.singleTile){
            layer = buildSingleTileLayer(options,clock,times)
     
        } else {
            var newCesiumOptions = wmsToCesiumOptions(options);
            layer = new Cesium.WebMapServiceImageryProvider(
                {
                    url: options.url,
                    layers: options.name,
                   
                    parameters: {
                        "transparent": "true",
                        "format": newCesiumOptions.parameters.format,
                        "styles": newCesiumOptions.parameters.styles,
                        // "access_token" : newCesiumOptions.parameters.access_token,
                        // "opacity":  options.opacity,
                    },
                    clock: clock,
                    times: times,
                    credit: newCesiumOptions.credit,
                }

            )
        }

        layer.updateParams = (params) => {
            const newOptions = {
                ...options,
                params: {
                    ...(options.params || {}),
                    ...params
                }
            };
            return createLayer(newOptions, map);
        };


        return layer;
    }

    function buildSingleTileLayer(options,clock,times){
        var newCesiumOptions = setSingleTileParameters(options);
        newCesiumOptions = wmsToCesiumOptions(newCesiumOptions);
        var layer = new Cesium.WebMapServiceImageryProvider(
            {
                url: options.url,
                rectangle: newCesiumOptions.rectangle,
                layers: options.name,                
                parameters :{
                    "transparent" : "true",
                    "format": newCesiumOptions.parameters.format,
                    "tiled": "false",
                    "styles": newCesiumOptions.parameters.styles || "",
                    //"access_token" : newCesiumOptions.parameters.access_token !== undefined ? newCesiumOptions.parameters.access_token:undefined,                  
                } ,
                clock: clock !== undefined ? clock: undefined,
                times: times !== undefined ? times: undefined,
                tilingScheme: newCesiumOptions.tilingScheme,
                tileHeight: newCesiumOptions.tileHeight,
                tileWidth: newCesiumOptions.tileWidth,
                credit: newCesiumOptions.credit,
                minimumLevel: newCesiumOptions.minimumLevel, // Ensure we start at the lowest level (0)
                maximumLevel: newCesiumOptions.maximumLevel,
            });
        return layer;    
    };

    function createTimeLineWidget(clock,map,domainValues) {
        const cesiumContainer = document.getElementsByClassName(map.cesiumWidget.container.className)[0];
         // Get the width of the Cesium container
        const cesiumContainerWidth = cesiumContainer.offsetWidth;

        // Create and append timeline container
        var timelineContainer = document.getElementById('timelineContainer');
        if (timelineContainer !== undefined && timelineContainer == null) {
            timelineContainer = document.createElement('div');
            timelineContainer.id = 'timelineContainer';
            timelineContainer.style.position = 'absolute';
            timelineContainer.style.bottom = '30px';
            timelineContainer.style.left = '340px';
            // Set the width of the timeline container to 80% of the Cesium container width
            timelineContainer.style.width = cesiumContainerWidth * 0.71 + "px";

            timelineContainer.style.height = '50px';
            document.getElementsByClassName(map.cesiumWidget.container.className)[0].appendChild(timelineContainer);
        }
        timeline = new Cesium.Timeline(timelineContainer, clock);
        const julianDates = domainValues.map(dateStr => Cesium.JulianDate.fromIso8601(dateStr));
        
        timeline.resize();
        timeline.addEventListener('settime', function (e) {
            clock.currentTime = e.timeJulian;
            setDefaultForDropDownDateList();
            //dateDropdown.innerHTML = '';
            map.scene.requestRender();
        }, false);
        // force rerender scene when time line is moving
        timeline.addEventListener('settime', function() {
            map.scene.requestRender();
        });

        clock.onTick.addEventListener(function(clock) {
            map.scene.requestRender();
        });
        map.scene.requestRenderMode = false;
        const dropdownContainer = document.getElementById("dropdownContainer");        
        addDropdownsToDOM(dropdownContainer,map,julianDates,options.id,clock,false); // 'dropdownContainer' is the id of the container element in your HTML
       
        timeline.updateFromClock();
        timeline.zoomTo(clock.startTime, clock.stopTime);
        
        return timelineContainer;
    }

   

    function createAnimationWidget(viewModel,map) {
        var animationContainer = document.getElementById('animationContainer');
        if (animationContainer !== undefined && animationContainer === null) {
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
        return createLayer(newOptions,map);
    }
    if (newOptions.visibility !== oldOptions.visibility){
        const timelineContainer = document.getElementById('timelineContainer');
        const dropdownContainer = document.getElementById("dropdownContainer");

        if (newOptions.visibility){
            if (layer._timeDynamicImagery !== undefined && layer._timeDynamicImagery._times._intervals !== null){
                setVisibilityTimeLine('visible',layer);
                const TimeintervalsjulianDates = layer._timeDynamicImagery._times._intervals;
                const julianDates = buildJulianDates(TimeintervalsjulianDates);
                addDropdownsToDOM(dropdownContainer ,map,julianDates,newOptions.id,map.clock,false); // 'dropdownContainer' is the id of the container element in your HTML
             } 
        } else {
            /* Start Business logic to hidden o remove timeline */
            if (layer._timeDynamicImagery !== undefined &&             
                layer._timeDynamicImagery._times._intervals !== null && 
                layer._timeDynamicImagery._times._intervals.length > 0 ) {
                const visibleLayers = map.imageryLayers._layers.filter(layer => layer.show);
                var foundwWmsWithTimeline = false;
                visibleLayers.forEach(layer => {
                        const wmsProvider = layer.imageryProvider;
                    
                        if (layer !== wmsProvider  && wmsProvider._timeDynamicImagery !==  undefined
                            &&  wmsProvider._timeDynamicImagery._times !== null 
                            && wmsProvider._timeDynamicImagery._times._intervals 
                            && wmsProvider._timeDynamicImagery._times._intervals.length > 0
                        ){
                            foundwWmsWithTimeline = true;
                        }
                    
                })
                if (!foundwWmsWithTimeline) {
                    setVisibilityTimeLine('hidden',layer);
                } 
                removeDropDownLayer(newOptions.id);
                
            }
        /* End Business logic to hidden  timeline */
        }
       
    }
    return null;
};

function setDefaultForDropDownDateList() {
    var dateDropdown = document.getElementById("dateDropdown");
    if (dateDropdown) {
        var foundDefault = false;
        var options = dateDropdown.options;
        for (var i = 0; i < options.length; i++) {
            if (options[i].value === '') {
                options[i].selected = true;
                foundDefault = true;
                break;
            }
        }
        if (!foundDefault) {
            var defaultDateOption = document.createElement('option');
            // Clear existing options
            defaultDateOption.value = '';
            defaultDateOption.disabled = true;
            defaultDateOption.selected = true;
            defaultDateOption.textContent = 'Select a Date';
            defaultDateOption.style.fontSize = '80%';
            dateDropdown.appendChild(defaultDateOption);
        }
    }
}

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

    const dropdownContainer = document.getElementById("dropdownContainer");
    if (dropdownContainer !== null) {
        dropdownContainer.style.visibility = visibility;

    }
    

}

function createCeisumClock( initialRange,map) {
    const clock = map.clock;
    const starttime = Cesium.JulianDate.fromDate(initialRange.start);
    const stopTime = Cesium.JulianDate.fromDate(initialRange.end);
    clock.startTime =Cesium.JulianDate.compare(clock.startTime ,starttime) <= 0 ? clock.startTime : starttime  ;
    clock.currentTime = Cesium.JulianDate.compare(clock.startTime ,starttime) <= 0 ? clock.startTime : starttime  ;
    clock.stopTime = Cesium.JulianDate.compare(clock.stopTime ,stopTime) <= 0 ? stopTime : clock.stopTime;
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

  

  function removeDropDownLayer(id) {
    var elements = document.querySelector("[id='layerDropdown']");
    if (elements && elements.length>0) {
        Array.from(elements.options).forEach(el => {
            if (el.value !== "" && el.value.includes(id)){
                el.remove();
                
            }
        });
    }
     elements = document.querySelector("[id='dateDropdown']");
     if (elements && elements.length>0) {
        Array.from(elements.options).forEach(el => {
            if (el.id !== "" && el.id.includes(id)){
                el.remove();
                
            }
        });
    }
    var options = document.getElementById('layerDropdown').options;
    for (var i = 0; i < options.length; i++) {
        if (options[i].value === '') {  
            options[i].selected = true;
            break;
        }
    }
    var dateDropdown = document.getElementById('dateDropdown')
    dateDropdown.innerHTML = '';
    };


function addDropdownsToDOM(dropdownContainer ,map,julianDates,id,clock,update) {
        
    const cesiumContainer = document.getElementsByClassName(map.cesiumWidget.container.className)[0];
    // Get the width of the Cesium container
    const cesiumContainerWidth = cesiumContainer.offsetWidth;
    // Create a container element (div) for the dropdowns
   
    let extractedWord;
    ({ extractedWord, dropdownContainer } = buildDropDownContainer(dropdownContainer, cesiumContainerWidth, map, id));
   
    // Add event listener for layer selection
    populateLayerDropdown(id,extractedWord,julianDates,clock,map);
    

   
}

function buildDropDownContainer(dropdownContainer, cesiumContainerWidth, map, id) {
     
    if (dropdownContainer !== undefined && dropdownContainer == null) {
        dropdownContainer = document.createElement('div');
        dropdownContainer.id = 'dropdownContainer';
        dropdownContainer.style.position = 'absolute';
        dropdownContainer.style.bottom = '80px';
        dropdownContainer.style.left = '375px';
        dropdownContainer.style.fontSize = '80%';
        dropdownContainer.className = 'cesium-baseLayerPicker-dropDown';
        // Set the width of the timeline container to 80% of the Cesium container width
        dropdownContainer.style.width = cesiumContainerWidth * 0.185 + "px";

        dropdownContainer.style.height = '80px';
        document.getElementsByClassName(map.cesiumWidget.container.className)[0].appendChild(dropdownContainer);
       
    }
     var buttonContainer = document.getElementById('buttonContainer');
     if (buttonContainer !== undefined && buttonContainer == null) {
         buttonContainer = document.createElement('div');
         buttonContainer.id = "buttonContainer";
         buttonContainer.style.position = 'absolute';
         buttonContainer.style.bottom = '80px';
         buttonContainer.style.left = '338px';
         //buttonContainer.style.backgroundColor = '#8080808c';
         buttonContainer.className="cesium-button cesium-toolbar-button";
         buttonContainer.title="Time Filter"
         buttonContainer.addEventListener('click', function (event) {
            if (dropdownContainer.className === 'cesium-baseLayerPicker-dropDown') {
                dropdownContainer.className = 'cesium-baseLayerPicker-dropDown cesium-baseLayerPicker-dropDown-visible';
            } else {
                dropdownContainer.className = 'cesium-baseLayerPicker-dropDown';
            }
        });
         var imgbutton = document.createElement('img');
         imgbutton.draggable= false;
         imgbutton.style.filter= "invert(1)";
         imgbutton.className ="cesium-baseLayerPicker-selected";
         imgbutton.style.width="110%";
         imgbutton.style.height="110%";
         imgbutton.src="/static/mapstore/img/clock-icon-with-research.png";
         buttonContainer.appendChild(imgbutton);
        document.getElementsByClassName(map.cesiumWidget.container.className)[0].appendChild(buttonContainer);
        
     }
    const match = id.match(/geonode:(.*?)__/);
    const extractedWord = match ? match[1] : null;
    // Create the Layer dropdown if not exsist 
    var layerDropdown = document.getElementById("layerDropdown");
    if (layerDropdown !== undefined && layerDropdown == null) {
        layerDropdown = document.createElement('select');
        layerDropdown.id = 'layerDropdown';
        layerDropdown.className = 'cesium-button';

        // Create a default option for the layer dropdown
        var defaultLayerOption = document.createElement('option');
        defaultLayerOption.value = '';
        defaultLayerOption.disabled = true;
        defaultLayerOption.selected = true;
        defaultLayerOption.textContent = 'Select a Layer';
        defaultLayerOption.style.fontSize = '80%';
        layerDropdown.appendChild(defaultLayerOption);
    }
    var dateDropdown = document.getElementById("dateDropdown");
    // Create the Date dropdown
    if (dateDropdown !== undefined && dateDropdown == null) {
        dateDropdown = document.createElement('select');
        dateDropdown.id = 'dateDropdown';
        dateDropdown.className = 'cesium-button';
        dateDropdown.style.left="15px";
        // Create a default option for the date dropdown
        var defaultDateOption = document.createElement('option');
        // Clear existing options
        defaultDateOption.value = '';
        defaultDateOption.disabled = true;
        defaultDateOption.selected = true;
        defaultDateOption.textContent = 'Select a Date';
        defaultDateOption.style.fontSize = '80%';
        dateDropdown.appendChild(defaultDateOption);
        dateDropdown.innerHTML = '';
        // Append the dropdowns to the container
        var label = document.createElement('label');
        label.style.fontSize = '90%';
        label.style.display = 'block';
        label.style.marginBottom = '1px';
        label.textContent = 'Time Filter';
        label.style.color="White";
        dropdownContainer.appendChild(label);
        dropdownContainer.appendChild(layerDropdown);
        dropdownContainer.appendChild(dateDropdown);

    }
    return { extractedWord, dropdownContainer };
}

// Function to populate the Layer dropdown
function populateLayerDropdown(id, name, julianDates, clock, map) {
    var layerDropdown = document.getElementById('layerDropdown');
    
    // se gia è presente un layer lo elimino per riaggiungerlo
    Array.from(layerDropdown.options).forEach(el => {
        if (el.value===id) {
            el.remove();
        }
    })

    var option = document.createElement('option');
    option.value = id;
    option.text = name;
    option.style.fontSize = '80%';
    layerDropdown.appendChild(option);

    if (layerDropdown) {
        layerDropdown.addEventListener('change', function (event) {
            var selectedlayer = event.target.value;
            if (selectedlayer !== '') {
                
                layerDates = JSON.parse(localStorage.getItem(storageKey)) || [];
                const existingLayer = layerDates.find(item => item.layer === selectedlayer);
                if (!existingLayer){
                    layerDates.push({ layer: selectedlayer, lastDate: '' });
                }
               
                if (selectedlayer === id) {
                    populateDateDropdown(id, julianDates, clock, map);
                
                }
            }
        });
        const existingLayer = layerDates.find(item => item.layer === id );
    
        if (existingLayer && existingLayer.lastDate !=='') {
            // Update the date for the existing layer
           
            layerDropdown.value = existingLayer.layer;
            populateDateDropdown(id, julianDates, clock, map);
           
        } 
        
    }
    
}

// Function to populate the Date dropdown
function populateDateDropdown(id,dates,clock,map) {
    layerDates = JSON.parse(localStorage.getItem(storageKey));
    var dateDropdown = document.getElementById('dateDropdown');
    dateDropdown.options.length = 0;
    var i = 0;
    const uniq = [
        ...new Map(dates.map(item => [item.dayNumber + '_' + item.secondsOfDay, item])).values()
    ];
    if (uniq.length<5){
        var prevNextContainer = document.getElementById('prevNextContainer');
        if (prevNextContainer && prevNextContainer!== null) {
            prevNextContainer.remove();
        }
        uniq.forEach(function(date) {
            var gregorianDate = Cesium.JulianDate.toGregorianDate(date);
            var isoDate = Cesium.JulianDate.toIso8601(date);
            var option = document.createElement('option');
            option.id = id+"_"+i 
            option.value = isoDate;
            option.text = `${gregorianDate.year}-${gregorianDate.month}-${gregorianDate.day}`;
            option.style.fontSize = '80%';
        
            dateDropdown.appendChild(option);
            i++;
        });
    } else {
        paginateDates(uniq,dateDropdown,5,id);
    }
    // Date selection event
    dateDropdown.addEventListener('change', function() {
        var selectedDate = this.value;
        if (selectedDate !== '') {
          
           var layerDropdown = document.getElementById('layerDropdown');
           const existingLayer = layerDates.find(item => item.layer === layerDropdown.value);
            if (existingLayer) {
                existingLayer.lastDate = selectedDate;
            } else {
                layerDates.push({ layer: id, lastDate: selectedDate });
            }
            localStorage.setItem(storageKey, JSON.stringify(layerDates));
            clock.currentTime = Cesium.JulianDate.fromIso8601(selectedDate);
            clock.shouldAnimate = false; 
            const layername = id.split('__')[0];
            const sourcecrs = Bboxlayers.get(layername).CRS;
            const { minx, miny, maxx, maxy } = Bboxlayers.get(layername);
            const bounds = reprojectBbox([minx, miny, maxx, maxy], sourcecrs, "EPSG:4326");
            const rectangle = Cesium.Rectangle.fromDegrees(parseFloat(bounds[0]), parseFloat(bounds[1]), parseFloat(bounds[2]), parseFloat(bounds[3]));
            map.camera.flyTo({destination:rectangle});   
            map.scene.requestRender();  
            var dateDropdownContainer = document.getElementById('dateDropdownContainer');
            if(dateDropdownContainer && dateDropdownContainer !== null) {
                dateDropdownContainer.style.display = 'none'; // Hide date dropdown  
            }
        }
      
       
    // You can now use the selectedDate for timeline-related actions
    });
    var layerDropdown = document.getElementById('layerDropdown');
    const existingLayer = layerDates.find(item => item.layer === layerDropdown.value);

    if (existingLayer && existingLayer.lastDate !=='') {
        // Update the date for the existing layer
       
        dateDropdown.value = existingLayer.lastDate;
        const event = new Event('change');
        dateDropdown.dispatchEvent(event);
    } 
   
}


// Function to remove the dropdownContainer from the DOM
function removeDropdownContainer() {
    var dropdownContainer = document.getElementById('dropdownContainer');
    if (dropdownContainer) {
        dropdownContainer.remove();  // This removes the container and its contents from the DOM
        //console.log('Dropdown container removed');
    } 
}

// Assuming you have an array of dates (dateArray) and a dropdown element (dropdown)
function paginateDates(dateArray, dropdown, pageSize,id) {
    const totalPages = Math.ceil(dateArray.length / pageSize);
    let currentPage = 1;
    const { prevButton, nextButton } = buildPrevNextContainer();

    function buildPrevNextContainer() {
        var dropdownContainer = document.getElementById('dropdownContainer');

        const prevButton = document.createElement('button');
        prevButton.style.position = 'realtive';

        prevButton.className = "cesium-button";
        prevButton.title = "Previous";
        prevButton.style.left = "5px";
        prevButton.textContent = "<";
        const nextButton = document.createElement('button');
       
        nextButton.className = "cesium-button";
        nextButton.title = "Next";
        nextButton.style.left = "0px";
        nextButton.textContent = ">";
        const prevNextContainer = document.createElement('div');
        prevNextContainer.id = "prevNextContainer";
        prevNextContainer.style.position = "absolute";
        prevNextContainer.style.left = "5px";
        const pageNumbers = document.createElement('span');
        pageNumbers.id="pageNumbers";
        pageNumbers.style.margin="70px";
        pageNumbers.style.color="white";
        if (totalPages > 1) {
            prevNextContainer.appendChild(prevButton);
            prevNextContainer.appendChild(pageNumbers);
            prevNextContainer.appendChild(nextButton);

            dropdownContainer.appendChild(prevNextContainer);
        } else {
            prevNextContainer.remove();
        }
        return { prevButton, nextButton };
    }

    function updateDropdown(start, end) {
      dropdown.innerHTML = '';
      
      setDefaultForDropDownDateList();
      for (let i = start; i < end; i++) {
         if (i< dateArray.length){
            var gregorianDate = Cesium.JulianDate.toGregorianDate(dateArray[i]);
            var isoDate = Cesium.JulianDate.toIso8601(dateArray[i]);
            `${gregorianDate.year}-${gregorianDate.month}-${gregorianDate.day}`;
            const option = document.createElement('option');
            option.id = id+"_"+i 
            option.value = isoDate;
            option.text = `${gregorianDate.year}-${gregorianDate.month}-${gregorianDate.day}`;
            option.style.fontSize = '80%';
        
            //option.textContent = dateArray[i];
            dropdown.appendChild(option);
         }
      }
      const pageNumbersElement = document.getElementById('pageNumbers');
      pageNumbersElement.textContent = `Page ${currentPage} of ${totalPages}`;
    
    }
  
    // Update dropdown initially
    updateDropdown(0, pageSize);
  
    // Pagination button handlers
    prevButton.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        updateDropdown((currentPage - 1) * pageSize, currentPage * pageSize);
      }
    });
  
    nextButton.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        updateDropdown((currentPage - 1) * pageSize, currentPage * pageSize);
      }
    });
  }
  
Layers.registerType('wms', {create: createLayer, update: updateLayer});
