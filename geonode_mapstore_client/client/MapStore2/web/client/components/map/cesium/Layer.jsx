/*
 * Copyright 2017, GeoSolutions Sas.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */
import React from 'react';

import Layers from '../../../utils/cesium/Layers';
import assign from 'object-assign';
import PropTypes from 'prop-types';
import { round, isNil } from 'lodash';
import { getResolutions } from '../../../utils/MapUtils';

class CesiumLayer extends React.Component {
    static propTypes = {
        map: PropTypes.object,
        type: PropTypes.string,
        options: PropTypes.object,
        onCreationError: PropTypes.func,
        position: PropTypes.number,
        securityToken: PropTypes.string,
        zoom: PropTypes.number
    };

    componentDidMount() {
        // initial visibility should also take into account the visibility limits
        // in particular for detached layers (eg. Vector, WFS, 3D Tiles, ...)
        const visibility = this.getVisibilityOption(this.props);       
        this.createLayer(this.props.type, { ...this.props.options, visibility }, this.props.position, this.props.map, this.props.securityToken);
        if (this.layer instanceof Promise) {
            this.layer.then( l=> {
                this.layer = l;
                if (this.props.options && this.layer && visibility) {
                    this.addLayer(this.props);
                    this.updateZIndex();
                }
            });
        } else 
        if (this.props.options && this.layer && visibility) {
            this.addLayer(this.props);
            this.updateZIndex();
        }
    }

    UNSAFE_componentWillReceiveProps(newProps) {

        this.setLayerVisibility(newProps);

        const newOpacity = newProps.options && newProps.options.opacity !== undefined ? newProps.options.opacity : 1.0;
        this.setLayerOpacity(newOpacity);

        if (newProps.position !== this.props.position) {
            this.updateZIndex(newProps.position);
            if (this.provider) {
                this.provider._position = newProps.position;
            }
        }
        if (this.layer instanceof Promise){
            this.layer.then( l=> {
                this.layer = l;
                if (this.props.options && this.layer.updateParams && newProps.options.visibility) {
                    const changed = Object.keys(this.props.options.params).reduce((found, param) => {
                        if (newProps.options.params[param] !== this.props.options.params[param]) {
                            return true;
                        }
                        return found;
                    }, false);
                    if (changed) {
                        const oldProvider = this.provider;
                        const newLayer = this.layer.updateParams(newProps.options.params);
                        this.layer = newLayer;
                        this.addLayer(newProps);
                        setTimeout(() => {
                            this.removeLayer(oldProvider);
                        }, 1000);
        
                    }
                }
                this.updateLayer(newProps, this.props);
            });
        } else
        if (this.props.options && this.props.options.params && this.layer.updateParams && newProps.options.visibility) {
            const changed = Object.keys(this.props.options.params).reduce((found, param) => {
                if (newProps.options.params[param] !== this.props.options.params[param]) {
                    return true;
                }
                return found;
            }, false);
            if (changed) {
                const oldProvider = this.provider;
                const newLayer = this.layer.updateParams(newProps.options.params);
                this.layer = newLayer;
                this.addLayer(newProps);
                setTimeout(() => {
                    this.removeLayer(oldProvider);
                }, 1000);

            }
        }
        this.updateLayer(newProps, this.props);
    }

    componentWillUnmount() {
        if (this.layer instanceof Promise){
            this.layer.then( l=> {
                this.layer = l;
                if (this.layer && this.props.map && !this.props.map.isDestroyed()) {
                    if (this.layer.detached && this.layer?.remove) {
                        this.layer.remove();
                    } else {
                        if (this.layer.destroy) {
                            this.layer.destroy();
                        }
        
                        this.props.map.imageryLayers.remove(this.provider);
                        this.removeDropDownContainer();
                        // document.querySelectorAll('.bookmark').forEach(el => {
                        //     if (el.id.includes(this.props.options.id)) {
                        //         el.remove()
                        //     }
                        // });
                    }
                    if (this.refreshTimer) {
                       
                        clearInterval(this.refreshTimer);
                    }
                }
            });
        } else 
        if (this.layer && this.props.map && !this.props.map.isDestroyed()) {
            // detached layers are layers that do not work through a provider
            // for this reason they cannot be added or removed from the map imageryProviders
            if (this.layer.detached && this.layer?.remove) {
                this.layer.remove();
            } else {
                if (this.layer.destroy) {
                    this.layer.destroy();
                }

                this.props.map.imageryLayers.remove(this.provider);
                this.removeDropDownLayer(this.layer._layers);
                // // remove timeline bookmark for this layer
                // document.querySelectorAll('.bookmark').forEach(el => {
                //     if (el.id.includes(this.props.options.id)) {
                //         el.remove();
                //     }
                // });
                const hasTimeDimension = this.props.map.imageryLayers._layers.some(layer => layer._imageryProvider._timeDynamicImagery);
                if (!hasTimeDimension){
                    const element = document.getElementById("timelineContainer");
                    if (element) {
                      element.remove();
                    }
                    const element2 = document.getElementById("animationContainer");
                    if (element2) {
                      element2.remove();
                    }
                    this.removeDropDownContainer();
                }
            }
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
            }
        }
    }

    removeDropDownContainer() {
        var dropdownContainer = document.getElementById('dropdownContainer');
        if (dropdownContainer) {
            dropdownContainer.remove(); // This removes the container and its contents from the DOM
            
        } 
    }

    removeDropDownLayer(id) {
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
        var layerdropdown = document.getElementById('layerDropdown');
        if (layerdropdown && layerdropdown.options ){
            var options = layerdropdown.options;
            for (var i = 0; i < options.length; i++) {
                if (options[i].value === '') {  
                    options[i].selected = true;
                    break;
                }
            }
        }
        var dateDropdown = document.getElementById('dateDropdown')
        if (dateDropdown) {
              dateDropdown.innerHTML = '';
        }
    };
    

    render() {
        if (this.props.children) {
            const layer = this.layer;
            const children = layer ? React.Children.map(this.props.children, child => {
                return child ? React.cloneElement(child, {container: layer, styleName: this.props.options && this.props.options.styleName}) : null;
            }) : null;
            return (
                <>
                    {children}
                </>
            );
        }
        return Layers.renderLayer(this.props.type, this.props.options, this.props.map, this.props.map.id, this.layer);

    }

    updateZIndex = (position) => {
        const layerPos = position || this.props.position;
        // in some cases the position index inside layer state
        // does not match the one inside imagery layers of Cesium
        // because a 3D environment could contain others entities that does not follow the imagery z index
        // (eg: terrain or meshes)
        if (this.provider) {
            // take the current index of the image layer
            const previousIndex = this.props.map.imageryLayers._layers.indexOf(this.provider);
            // sort list of imagery layers by new positions
            const nextImageryLayersOrder = [...this.props.map.imageryLayers._layers].sort((a, b) => {
                const aPosition = a === this.provider ? layerPos : a._position;
                const bPosition = b === this.provider ? layerPos : b._position;
                return aPosition - bPosition;
            });
            // take the next index of the image layer
            const nextIndex = nextImageryLayersOrder.indexOf(this.provider);
            const diff = nextIndex - previousIndex;
            if (diff !== 0) {
                [...new Array(Math.abs(diff)).keys()]
                    .forEach(() => {
                        this.props.map.imageryLayers[diff > 0 ? 'raise' : 'lower'](this.provider);
                    });
            }
            this.props.map.scene.requestRender();
        }
    };

    setDetachedLayerVisibility = (visibility, props) => {
        // use internal setVisible
        // if a detached layers implements setVisible
        if (this.layer?.setVisible) {
            this.layer.setVisible(visibility);
            return;
        }
        // if visible we will remove the layer and create a new one
        if (visibility) {
            this.removeLayer();
            this.createLayer(props.type, {
                ...props.options,
                visibility
            }, props.position, props.map, props.securityToken);
            return;
        }
        // while hidden layers will be completely removed
        this.removeLayer();
        return;
    };

    setImageryLayerVisibility = (visibility, props) => {
        // this type of layer will be added and removed from the imageryLayers array of Cesium
        if (visibility) {
            this.addLayer(props);
            this.updateZIndex();
            return;
        }
        this.removeLayer();
        return;
    }

    setLayerVisibility = (newProps) => {
        const oldVisibility = this.getVisibilityOption(this.props);
        const newVisibility = this.getVisibilityOption(newProps);
        if (newVisibility !== oldVisibility) {
            if (!!this.layer?.detached) {
                this.setDetachedLayerVisibility(newVisibility, newProps);
            } else {
                this.setImageryLayerVisibility(newVisibility, newProps);
            }
            newProps.map.scene.requestRender();
        }
    };

    getVisibilityOption = (props) => {
        // use the global resolutions as fallback
        // cesium does not provide resolutions
        const { options = {}, zoom, resolutions = getResolutions() } = props;
        const intZoom = round(zoom);
        const {
            visibility,
            minResolution = -Infinity,
            maxResolution = Infinity,
            disableResolutionLimits
        } = options || {};
        if (!disableResolutionLimits && !isNil(resolutions[intZoom])) {
            const resolution = resolutions[intZoom];
            // use similar approach of ol
            // maxResolution is exclusive
            // minResolution is inclusive
            if (!(resolution < maxResolution && resolution >= minResolution)) {
                return false;
            }
        }
        return !!visibility;
    };

    setLayerOpacity = (opacity) => {
        var oldOpacity = this.props.options && this.props.options.opacity !== undefined ? this.props.options.opacity : 1.0;
        if (opacity !== oldOpacity && this.layer && this.provider) {
            this.provider.alpha = opacity;
            this.props.map.scene.requestRender();
        }
    };

    createLayer = (type, options, position, map, securityToken) => {
        if (type) {
            const opts = assign({}, options, position ? {zIndex: position} : null, {securityToken});
            this.layer = Layers.createLayer(type, opts, map);

            if (this.layer) {
                this.layer.layerName = options.name;
                this.layer.layerId = options.id;
            }
            if (this.layer === null) {
                this.props.onCreationError(options);
            }
            this.props.map.scene.requestRender();
        }
    };

    updateLayer = (newProps, oldProps) => {
        const newLayer = Layers.updateLayer(newProps.type, this.layer, {...newProps.options, securityToken: newProps.securityToken}, {...oldProps.options, securityToken: oldProps.securityToken}, this.props.map);
        if (newLayer && newLayer instanceof Promise){
            newLayer.then( l=> {
                this.removeLayer();
                this.layer = l;
                if (newProps.options.visibility) {
                    this.addLayer(newProps);
                  
                }
                newProps.map.scene.requestRender();
            })

        } else 
        if (newLayer) {
            this.removeLayer();
            this.layer = newLayer;
            if (newProps.options.visibility) {
                this.addLayer(newProps);
              
            }
          
        }
        newProps.map.scene.requestRender();
    };

    addLayerInternal = (newProps) => {
        if (newProps.options.useForElevation) {
            this.props.map.terrainProvider = this.layer;
        } else {
            if (this.layer instanceof Promise){
                this.layer.then( l=> {
                    this.layer = l;
                    this.provider = this.props.map.imageryLayers.addImageryProvider(this.layer);
                    this.provider._position = this.props.position;
                    if (newProps.options.opacity !== undefined) {
                        this.provider.alpha = newProps.options.opacity;
                        this.props.map.scene.requestRender(); 
                    }
                                   
                }
            )} else {
                this.provider = this.props.map.imageryLayers.addImageryProvider(this.layer);
                this.provider._position = this.props.position;
                if (newProps.options.opacity !== undefined) {
                    this.provider.alpha = newProps.options.opacity;
                    this.props.map.scene.requestRender();  
                }           
            }
        }
        newProps.map.scene.requestRender();
    };

    addLayer = (newProps) => {
        // detached layers are layers that do not work through a provider
        // for this reason they cannot be added or removed from the map imageryProviders
        if (this.layer && !this.layer.detached) {
            this.addLayerInternal(newProps);
            if (this.props.options.refresh && this.layer.updateParams) {
                let counter = 0;
                this.refreshTimer = setInterval(() => {
                    const newLayer = this.layer.updateParams(assign({}, this.props.options.params, {_refreshCounter: counter++}));
                    this.removeLayer();
                    this.layer = newLayer;
                    this.addLayerInternal(newProps);
                    this.props.map.scene.requestRender();
                }, this.props.options.refresh);
            }
        }
    };

    removeLayer = (provider) => {
        const toRemove = provider || this.provider;
        if (toRemove) {
            this.props.map.imageryLayers.remove(toRemove);
        }
        // detached layers are layers that do not work through a provider
        // for this reason they cannot be added or removed from the map imageryProviders
        if (this.layer?.detached && this.layer?.remove) {
            this.layer.remove();
            
        }
        
        this.props.map.scene.requestRender();
    };
}

export default CesiumLayer;
