#!/usr/bin/env node

'use strict';

var fs = require('fs');
var glob = require('glob');
var Promise = require('bluebird');
var watchGlob = require('watch-glob');
var watchify = require('watchify');
var browserify = require('browserify');
var cors_proxy = require('corsproxy');
var http_proxy = require('pouchdb-http-proxy');
var http_server = require('http-server');

var queryParams = {};

if (process.env.ES5_SHIM || process.env.ES5_SHIMS) {
  queryParams.es5shim = true;
}
if (process.env.ADAPTERS) {
  queryParams.adapters = process.env.ADAPTERS;
}
if (process.env.AUTO_COMPACTION) {
  queryParams.autoCompaction = true;
}

var indexfile = "./lib/index.js";
var outfile = "./dist/pouchdb.js";
var perfRoot = './tests/performance/*.js';
var performanceBundle = './tests/performance-bundle.js';

var w = watchify(browserify(indexfile, {
  standalone: "PouchDB",
  cache: {},
  packageCache: {},
  fullPaths: true
})).on('update', bundle);


function bundle(callback) {
  w.bundle().pipe(fs.createWriteStream(outfile))
  .on('finish', function () {
    console.log('Updated: ', outfile);
  });
}

function bundlePerfTests(callback) {
  glob(perfRoot, function (err, files) {
    var b = browserify(files);
    b.bundle().pipe(fs.createWriteStream(performanceBundle))
    .on('finish', function () {
      console.log('Updated: ', performanceBundle);
    });
  });
}

watchGlob(perfRoot, bundlePerfTests);

var filesWritten = false;
Promise.all([
  new Promise(function (resolve) {
    bundle(resolve);
  }),
  new Promise(function (resolve) {
    bundlePerfTests(resolve);
  })
]).then(function () {
  filesWritten = true;
  checkReady();
});

var COUCH_HOST = process.env.COUCH_HOST || 'http://127.0.0.1:5984';

var HTTP_PORT = 8000;
var CORS_PORT = 2020;

var serversStarted;
var readyCallback;

function startServers(callback) {
  readyCallback = callback;
  http_server.createServer().listen(HTTP_PORT, function () {
    cors_proxy.options = {target: COUCH_HOST};
    http_proxy.createServer(cors_proxy).listen(CORS_PORT, function () {
      var testRoot = 'http://127.0.0.1:' + HTTP_PORT;
      var query = '';
      Object.keys(queryParams).forEach(function (key) {
        query += (query ? '&' : '?');
        query += key + '=' + encodeURIComponent(queryParams[key]);
      });
      console.log('Integration tests: ' + testRoot +
        '/tests/test.html' + query);
      console.log('Performance tests: ' + testRoot +
        '/tests/performance/test.html');
      serversStarted = true;
      checkReady();
    });
  });
}

function checkReady() {
  if (filesWritten && serversStarted && readyCallback) {
    readyCallback();
  }
}


if (require.main === module) {
  startServers();
} else {
  module.exports.start = startServers;
}
