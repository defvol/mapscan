(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var q = require('d3-queue');
var tilebelt = require('@mapbox/tilebelt');

var subgrid = {
    type: 'FeatureCollection',
    features: []
};

mapboxgl.accessToken = 'pk.eyJ1Ijoicm9kb3dpIiwiYSI6ImdZdDkyQU0ifQ.bPu86kwHgaenPhYp84g1yg';

/**
 * Get tiles at higher zoom levels
 * @param {Array} tile [x, y, z]
 * @param {Number} depth
 * @return {Array} children
 */
function getChildren(tile, depth) {
    var __flatten = (p, c) => p.concat(c);
    var cc = [tile];

    for (var i = 0; i < depth; i++) {
        cc = cc.map(tilebelt.getChildren).reduce(__flatten, []);
    }

    return cc;
}

function processTile(tile, featureIndex, osMap, callback) {
    setTimeout(function () {
        console.log('finished processing', tile);
        subgrid.features[featureIndex].properties.processed = true;
        osMap.getSource('subgrid').setData(subgrid);
        callback();
    }, 100);
}

window.onload = function() {
  var satMap = new mapboxgl.Map({
      container: 'before',
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [0, 0],
      zoom: 0
  });

  var osMap = new mapboxgl.Map({
      container: 'after',
      style: 'mapbox://styles/rodowi/ciz26g64u002g2spru77a8mk0',
      center: [0, 0],
      zoom: 0
  });

  osMap.on('load', function() {
      var busy = false;

      osMap.addSource('grid', {
          'type': 'vector',
          'url': 'mapbox://rodowi.3hb2t4ac'
      });

      osMap.addLayer({
          'id': 'tiles',
          'type': 'fill',
          'source': 'grid',
          'source-layer': 'tiles',
          'paint': {
              'fill-color': 'hsla(0,0,1,0)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          }
      });

      osMap.addSource('subgrid', {
          type: 'geojson',
          data: subgrid
      });

      osMap.addLayer({
          'id': 'subtiles',
          'type': 'fill',
          'source': 'subgrid',
          'paint': {
              'fill-color': 'hsla(0,0,1,0)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          }
      });

      osMap.addLayer({
          'id': 'subtiles-highlighted',
          'type': 'fill',
          'source': 'subgrid',
          'paint': {
              'fill-color': 'hsla(293,1.0,0.5,0.25)',
              'fill-outline-color': 'hsla(293,1.0,0.5,0.5)'
          },
          'filter': ['has', 'processed']
      });

      osMap.on('click', function(e) {
          if (busy) {
              console.log('we are busy processing tiles, try again later');
              return;
          }

          busy = true;
          var queue = q.queue(1)
          var layers = ['tiles'];
          var features = osMap.queryRenderedFeatures(e.point, { layers: layers });
          for (var i = 0; i < features.length; i++) {
              var title = features[i].properties.title;
              var tile = title
                  .match(/(\d+, \d+, \d+)/)[0]
                  .split(', ')
                  .map(s => parseInt(s));
              console.log('clicking tile', tile);

              var z16 = getChildren(tile, 4);
              subgrid.features = [];
              for (var i = 0; i < z16.length; i++) {
                  var f = {
                      type: 'Feature',
                      properties: {},
                      geometry: tilebelt.tileToGeoJSON(z16[i])
                  };
                  subgrid.features.push(f);
                  queue.defer(processTile, z16[i], i, osMap);
              }
              osMap.getSource('subgrid').setData(subgrid);
          }

          queue.awaitAll(function (err, results) {
              busy = false;
              if (err) console.log(err);
              else console.log('finished %d z16 tiles', results.length);
          });
      });
  });

  var map = new mapboxgl.Compare(satMap, osMap, {});
};

},{"@mapbox/tilebelt":2,"d3-queue":3}],2:[function(require,module,exports){
'use strict';

var d2r = Math.PI / 180,
    r2d = 180 / Math.PI;

/**
 * Get the bbox of a tile
 *
 * @name tileToBBOX
 * @param {Array<number>} tile
 * @returns {Array<number>} bbox
 * @example
 * var bbox = tileToBBOX([5, 10, 10])
 * //=bbox
 */
function tileToBBOX(tile) {
    var e = tile2lon(tile[0] + 1, tile[2]);
    var w = tile2lon(tile[0], tile[2]);
    var s = tile2lat(tile[1] + 1, tile[2]);
    var n = tile2lat(tile[1], tile[2]);
    return [w, s, e, n];
}

/**
 * Get a geojson representation of a tile
 *
 * @name tileToGeoJSON
 * @param {Array<number>} tile
 * @returns {Feature<Polygon>}
 * @example
 * var poly = tileToGeoJSON([5, 10, 10])
 * //=poly
 */
function tileToGeoJSON(tile) {
    var bbox = tileToBBOX(tile);
    var poly = {
        type: 'Polygon',
        coordinates: [[
            [bbox[0], bbox[1]],
            [bbox[0], bbox[3]],
            [bbox[2], bbox[3]],
            [bbox[2], bbox[1]],
            [bbox[0], bbox[1]]
        ]]
    };
    return poly;
}

function tile2lon(x, z) {
    return x / Math.pow(2, z) * 360 - 180;
}

function tile2lat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return r2d * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Get the tile for a point at a specified zoom level
 *
 * @name pointToTile
 * @param {number} lon
 * @param {number} lat
 * @param {number} z
 * @returns {Array<number>} tile
 * @example
 * var tile = pointToTile(1, 1, 20)
 * //=tile
 */
function pointToTile(lon, lat, z) {
    var tile = pointToTileFraction(lon, lat, z);
    tile[0] = Math.floor(tile[0]);
    tile[1] = Math.floor(tile[1]);
    return tile;
}

/**
 * Get the 4 tiles one zoom level higher
 *
 * @name getChildren
 * @param {Array<number>} tile
 * @returns {Array<Array<number>>} tiles
 * @example
 * var tiles = getChildren([5, 10, 10])
 * //=tiles
 */
function getChildren(tile) {
    return [
        [tile[0] * 2, tile[1] * 2, tile[2] + 1],
        [tile[0] * 2 + 1, tile[1] * 2, tile[2 ] + 1],
        [tile[0] * 2 + 1, tile[1] * 2 + 1, tile[2] + 1],
        [tile[0] * 2, tile[1] * 2 + 1, tile[2] + 1]
    ];
}

/**
 * Get the tile one zoom level lower
 *
 * @name getParent
 * @param {Array<number>} tile
 * @returns {Array<number>} tile
 * @example
 * var tile = getParent([5, 10, 10])
 * //=tile
 */
function getParent(tile) {
    // top left
    if (tile[0] % 2 === 0 && tile[1] % 2 === 0) {
        return [tile[0] / 2, tile[1] / 2, tile[2] - 1];
    }
    // bottom left
    if ((tile[0] % 2 === 0) && (!tile[1] % 2 === 0)) {
        return [tile[0] / 2, (tile[1] - 1) / 2, tile[2] - 1];
    }
    // top right
    if ((!tile[0] % 2 === 0) && (tile[1] % 2 === 0)) {
        return [(tile[0] - 1) / 2, (tile[1]) / 2, tile[2] - 1];
    }
    // bottom right
    return [(tile[0] - 1) / 2, (tile[1] - 1) / 2, tile[2] - 1];
}

function getSiblings(tile) {
    return getChildren(getParent(tile));
}

/**
 * Get the 3 sibling tiles for a tile
 *
 * @name getSiblings
 * @param {Array<number>} tile
 * @returns {Array<Array<number>>} tiles
 * @example
 * var tiles = getSiblings([5, 10, 10])
 * //=tiles
 */
function hasSiblings(tile, tiles) {
    var siblings = getSiblings(tile);
    for (var i = 0; i < siblings.length; i++) {
        if (!hasTile(tiles, siblings[i])) return false;
    }
    return true;
}

/**
 * Check to see if an array of tiles contains a particular tile
 *
 * @name hasTile
 * @param {Array<Array<number>>} tiles
 * @param {Array<number>} tile
 * @returns {boolean}
 * @example
 * var tiles = [
 *     [0, 0, 5],
 *     [0, 1, 5],
 *     [1, 1, 5],
 *     [1, 0, 5]
 * ]
 * hasTile(tiles, [0, 0, 5])
 * //=boolean
 */
function hasTile(tiles, tile) {
    for (var i = 0; i < tiles.length; i++) {
        if (tilesEqual(tiles[i], tile)) return true;
    }
    return false;
}

/**
 * Check to see if two tiles are the same
 *
 * @name tilesEqual
 * @param {Array<number>} tile1
 * @param {Array<number>} tile2
 * @returns {boolean}
 * @example
 * tilesEqual([0, 1, 5], [0, 0, 5])
 * //=boolean
 */
function tilesEqual(tile1, tile2) {
    return (
        tile1[0] === tile2[0] &&
        tile1[1] === tile2[1] &&
        tile1[2] === tile2[2]
    );
}

/**
 * Get the quadkey for a tile
 *
 * @name tileToQuadkey
 * @param {Array<number>} tile
 * @returns {string} quadkey
 * @example
 * var quadkey = tileToQuadkey([0, 1, 5])
 * //=quadkey
 */
function tileToQuadkey(tile) {
    var index = '';
    for (var z = tile[2]; z > 0; z--) {
        var b = 0;
        var mask = 1 << (z - 1);
        if ((tile[0] & mask) !== 0) b++;
        if ((tile[1] & mask) !== 0) b += 2;
        index += b.toString();
    }
    return index;
}

/**
 * Get the tile for a quadkey
 *
 * @name quadkeyToTile
 * @param {string} quadkey
 * @returns {Array<number>} tile
 * @example
 * var tile = quadkeyToTile('00001033')
 * //=tile
 */
function quadkeyToTile(quadkey) {
    var x = 0;
    var y = 0;
    var z = quadkey.length;

    for (var i = z; i > 0; i--) {
        var mask = 1 << (i - 1);
        var q = +quadkey[z - i];
        if (q === 1) x |= mask;
        if (q === 2) y |= mask;
        if (q === 3) {
            x |= mask;
            y |= mask;
        }
    }
    return [x, y, z];
}

/**
 * Get the smallest tile to cover a bbox
 *
 * @name bboxToTile
 * @param {Array<number>} bbox
 * @returns {Array<number>} tile
 * @example
 * var tile = bboxToTile([ -178, 84, -177, 85 ])
 * //=tile
 */
function bboxToTile(bboxCoords) {
    var min = pointToTile(bboxCoords[0], bboxCoords[1], 32);
    var max = pointToTile(bboxCoords[2], bboxCoords[3], 32);
    var bbox = [min[0], min[1], max[0], max[1]];

    var z = getBboxZoom(bbox);
    if (z === 0) return [0, 0, 0];
    var x = bbox[0] >>> (32 - z);
    var y = bbox[1] >>> (32 - z);
    return [x, y, z];
}

function getBboxZoom(bbox) {
    var MAX_ZOOM = 28;
    for (var z = 0; z < MAX_ZOOM; z++) {
        var mask = 1 << (32 - (z + 1));
        if (((bbox[0] & mask) !== (bbox[2] & mask)) ||
            ((bbox[1] & mask) !== (bbox[3] & mask))) {
            return z;
        }
    }

    return MAX_ZOOM;
}

/**
 * Get the precise fractional tile location for a point at a zoom level
 *
 * @name pointToTileFraction
 * @param {number} lon
 * @param {number} lat
 * @param {number} z
 * @returns {Array<number>} tile fraction
 * var tile = pointToTileFraction(30.5, 50.5, 15)
 * //=tile
 */
function pointToTileFraction(lon, lat, z) {
    var sin = Math.sin(lat * d2r),
        z2 = Math.pow(2, z),
        x = z2 * (lon / 360 + 0.5),
        y = z2 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return [x, y, z];
}

module.exports = {
    tileToGeoJSON: tileToGeoJSON,
    tileToBBOX: tileToBBOX,
    getChildren: getChildren,
    getParent: getParent,
    getSiblings: getSiblings,
    hasTile: hasTile,
    hasSiblings: hasSiblings,
    tilesEqual: tilesEqual,
    tileToQuadkey: tileToQuadkey,
    quadkeyToTile: quadkeyToTile,
    pointToTile: pointToTile,
    bboxToTile: bboxToTile,
    pointToTileFraction: pointToTileFraction
};

},{}],3:[function(require,module,exports){
// https://d3js.org/d3-queue/ Version 3.0.3. Copyright 2016 Mike Bostock.
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.d3 = global.d3 || {})));
}(this, (function (exports) { 'use strict';

var slice = [].slice;

var noabort = {};

function Queue(size) {
  if (!(size >= 1)) throw new Error;
  this._size = size;
  this._call =
  this._error = null;
  this._tasks = [];
  this._data = [];
  this._waiting =
  this._active =
  this._ended =
  this._start = 0; // inside a synchronous task callback?
}

Queue.prototype = queue.prototype = {
  constructor: Queue,
  defer: function(callback) {
    if (typeof callback !== "function" || this._call) throw new Error;
    if (this._error != null) return this;
    var t = slice.call(arguments, 1);
    t.push(callback);
    ++this._waiting, this._tasks.push(t);
    poke(this);
    return this;
  },
  abort: function() {
    if (this._error == null) abort(this, new Error("abort"));
    return this;
  },
  await: function(callback) {
    if (typeof callback !== "function" || this._call) throw new Error;
    this._call = function(error, results) { callback.apply(null, [error].concat(results)); };
    maybeNotify(this);
    return this;
  },
  awaitAll: function(callback) {
    if (typeof callback !== "function" || this._call) throw new Error;
    this._call = callback;
    maybeNotify(this);
    return this;
  }
};

function poke(q) {
  if (!q._start) {
    try { start(q); } // let the current task complete
    catch (e) {
      if (q._tasks[q._ended + q._active - 1]) abort(q, e); // task errored synchronously
      else if (!q._data) throw e; // await callback errored synchronously
    }
  }
}

function start(q) {
  while (q._start = q._waiting && q._active < q._size) {
    var i = q._ended + q._active,
        t = q._tasks[i],
        j = t.length - 1,
        c = t[j];
    t[j] = end(q, i);
    --q._waiting, ++q._active;
    t = c.apply(null, t);
    if (!q._tasks[i]) continue; // task finished synchronously
    q._tasks[i] = t || noabort;
  }
}

function end(q, i) {
  return function(e, r) {
    if (!q._tasks[i]) return; // ignore multiple callbacks
    --q._active, ++q._ended;
    q._tasks[i] = null;
    if (q._error != null) return; // ignore secondary errors
    if (e != null) {
      abort(q, e);
    } else {
      q._data[i] = r;
      if (q._waiting) poke(q);
      else maybeNotify(q);
    }
  };
}

function abort(q, e) {
  var i = q._tasks.length, t;
  q._error = e; // ignore active callbacks
  q._data = undefined; // allow gc
  q._waiting = NaN; // prevent starting

  while (--i >= 0) {
    if (t = q._tasks[i]) {
      q._tasks[i] = null;
      if (t.abort) {
        try { t.abort(); }
        catch (e) { /* ignore */ }
      }
    }
  }

  q._active = NaN; // allow notification
  maybeNotify(q);
}

function maybeNotify(q) {
  if (!q._active && q._call) {
    var d = q._data;
    q._data = undefined; // allow gc
    q._call(q._error, d);
  }
}

function queue(concurrency) {
  return new Queue(arguments.length ? +concurrency : Infinity);
}

exports.queue = queue;

Object.defineProperty(exports, '__esModule', { value: true });

})));
},{}]},{},[1]);
