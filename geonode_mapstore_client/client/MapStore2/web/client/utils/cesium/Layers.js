/*
 * Copyright 2017, GeoSolutions Sas.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

const layerTypes = {};

const Layers = {

    registerType: function(type, impl) {
        layerTypes[type] = impl;
    },

    createLayer: async function(type, options, map) {
        var layerCreator = layerTypes[type];
        if (layerCreator && layerCreator.create) {
            const l = await layerCreator.create(options, map);
            return l;
        } else if (layerCreator) {
            // TODO this compatibility workaround should be removed
            // using the same interface
            return layerCreator(options, map);
        }
        return null;
    },
    renderLayer: function(type, options, map, mapId, layer) {
        var layerCreator = layerTypes[type];
        if (layerCreator && layerCreator.render) {
            return layerCreator.render(options, map, mapId, layer);
        }
        return null;
    },
    updateLayer: function(type, layer, newOptions, oldOptions, map) {
        var layerCreator = layerTypes[type];
        if (layerCreator && layerCreator.update) {
            return layerCreator.update(layer, newOptions, oldOptions, map);
        }
        return null;
    },
    isSupported(type) {
        return !!layerTypes[type];
    }
};

export default Layers;
