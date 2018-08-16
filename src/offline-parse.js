(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['Parse', 'Pouchdb'], factory);
    } else {
        factory(Parse, PouchDB);
    }
}(this, function (Parse, PouchDB) {
    var _db,
        _config,
        _connectionType = {
            UNKNOWN: 'unknown',
            ETHERNET: 'ethernet',
            WIFI: 'wifi',
            CELL_2G: '2g',
            CELL_3G: '3g',
            CELL_4G: '4g',
            CELL: 'cellular',
            NONE: 'none'
        };

    if (!Array.isArray) {
        Array.isArray = function (arg) {
            return Object.prototype.toString.call(arg) === '[object Array]';
        };
    }

    if (typeof Array.prototype.chunk !== 'function') {
        Array.prototype.chunk = function (chunkSize) {
            var R = [];
            for (var i = 0; i < this.length; i += chunkSize)
                R.push(this.slice(i, i + chunkSize));
            return R;
        };
    }

    if (typeof Array.prototype.map !== 'function') {
        Array.prototype.map = function (cb) {
            var xs = this,
                res = [];

            for (var i = 0; i < xs.length; i++) {
                var x = xs[i];
                if (Object.prototype.hasOwnProperty.call(xs, i)) {
                    res.push(f(x, i, xs));
                }
            }
            return res;
        };
    }

    if (!Array.prototype.reduce) {
        Object.defineProperty(Array.prototype, 'reduce', {
            value: function (callback /*, initialValue*/) {
                if (this === null) {
                    throw new TypeError('Array.prototype.reduce ' +
                        'called on null or undefined');
                }
                if (typeof callback !== 'function') {
                    throw new TypeError(callback +
                        ' is not a function');
                }

                var o = Object(this);
                var len = o.length >>> 0;
                var k = 0;
                var value;

                if (arguments.length >= 2) {
                    value = arguments[1];
                } else {
                    while (k < len && !(k in o)) {
                        k++;
                    }

                    if (k >= len) {
                        throw new TypeError('Reduce of empty array ' +
                            'with no initial value');
                    }
                    value = o[k++];
                }

                while (k < len) {
                    if (k in o) {
                        value = callback(value, o[k], k, o);
                    }
                    k++;
                }

                return value;
            }
        });
    }

    function guid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function isPlainObject(obj) {
        var proto, Ctor;
        if (!obj || toString.call(obj) !== "[object Object]") {
            return false;
        }

        proto = Object.getPrototypeOf(obj);

        if (!proto) {
            return true;
        }

        Ctor = proto.hasOwnProperty("constructor") && proto.constructor;

        return typeof Ctor === "function" && typeof Ctor.toString === 'function';
    }

    function extend() {
        var options, name, src, copy, copyIsArray, clone,
            target = arguments[0] || {},
            i = 1,
            length = arguments.length,
            deep = false;

        if (typeof target === "boolean") {
            deep = target;

            target = arguments[i] || {};
            i++;
        }

        if (typeof target !== "object" && typeof target !== 'function') {
            target = {};
        }

        if (i === length) {
            target = this;
            i--;
        }

        for (; i < length; i++) {
            if ((options = arguments[i]) != null) {

                for (name in options) {
                    src = target[name];
                    copy = options[name];

                    if (target === copy) {
                        continue;
                    }

                    if (deep && copy && (isPlainObject(copy) ||
                        (copyIsArray = Array.isArray(copy)))) {

                        if (copyIsArray) {
                            copyIsArray = false;
                            clone = src && Array.isArray(src) ? src : [];

                        } else {
                            clone = src && isPlainObject(src) ? src : {};
                        }

                        target[name] = extend(deep, clone, copy);

                    } else if (copy !== undefined) {
                        target[name] = copy;
                    }
                }
            }
        }

        return target;
    }


    function _query_local(className, src, opt) {
        var whr = { selector: Object.assign({ className: className }, src.where || {}) };
        if (src.limit) {
            whr.limit = src.limit;
        }
        if (src.order) {
            whr.sort = src.order.split(',').map(function (si) {
                var rs = {},
                    ord = "asc";

                if (si.indexOf('-') === 0) {
                    ord = "desc";
                    si = si.substr(1);
                }
                if (!whr.selector[si]) {
                    whr.selector[si] = { $gt: true };
                }
                rs[si] = ord;
                return rs;
            });
        }
        var i, vk,
            vks = Object.keys(whr.selector);
        for (i = 0; i < vks.length; i++) {
            vk = vks[i];
            if (whr.selector[vk].__type === 'Pointer') {
                whr.selector[vk + '.objectId'] = whr.selector[vk].objectId;
                delete whr.selector[vk];
            }
        }
        if (src.count && !src.limit) {
            whr.fields = ['_id'];
        }

        return _db.find(whr)
            .then(function (rd) {
                var rz = { results: [] };

                if (src.count) {
                    rz.count = rd.docs.length;
                }
                if (!rd || !rd.docs || !rd.docs.length || (src.count && !src.limit)) {
                    return rz;
                }
                rz.results = rd.docs.map(function (ri) {
                    if (ri._id) {
                        delete ri._id;
                    }
                    if (ri._rev) {
                        delete ri._rev;
                    }
                    return ri;
                });

                if (!src.include) {
                    return rz;
                }

                return src.include.split(',').chunk(3).reduce(function (pms, ainc) {
                    return pms.then(function () {
                        return Promise.all(ainc.map(function (ok) {
                            var vj = [], i, cnm, slct = { selector: {} };

                            for (i = 0; i < rz.results.length; i++) {
                                if (rz.results[i][ok] &&
                                    rz.results[i][ok].objectId &&
                                    (vj.indexOf(rz.results[i][ok].objectId) === -1)) {
                                    cnm = cnm || rz.results[i][ok].className;
                                    vj.push(rz.results[i][ok].objectId);
                                }
                            }
                            if (!cnm) {
                                return Promise.resolve();
                            }
                            slct.selector.className = cnm;
                            slct.selector.objectId = { $in: vj };

                            return _db.find(slct)
                                .then(function (ndc) {
                                    var vds = {}, i;

                                    if (ndc && ndc.docs) {
                                        for (i = 0; i < ndc.docs.length; i++) {
                                            vds[ndc.docs[i].objectId] = ndc.docs[i];
                                            if (vds[ndc.docs[i].objectId]._id) {
                                                delete vds[ndc.docs[i].objectId]._id;
                                            }
                                            if (vds[ndc.docs[i].objectId]._rev) {
                                                delete vds[ndc.docs[i].objectId]._rev;
                                            }
                                        }
                                        for (i = 0; i < rz.results.length; i++) {
                                            if (rz.results[i][ok] &&
                                                rz.results[i][ok].objectId &&
                                                vds[rz.results[i][ok].objectId]) {
                                                rz.results[i][ok] = vds[rz.results[i][ok].objectId];
                                                rz.results[i][ok].__type = 'Object';
                                            }
                                        }
                                    }
                                });
                        }));
                    });
                }, Promise.resolve())
                    .then(function () {
                        return rz;
                    });

            },
                function (i) {
                    Framework7.log(i);
                });
    }

    var _dbAdapters = {
        object: {
            destroy: function (target, options) {
                return _dbAdapters._object.destroy(target, options)
                    .then(function (ri) {
                        var vk;
                        if (Array.isArray(target)) {
                            vk = target.chunk(5);
                            return vk.reduce(function (pms, pka) {
                                return pms.then(function () {
                                    return Promise.all(pka.map(function (ti) {
                                        var ki = ti.className + '#' + ti._getId();
                                        return _db.get(ki)
                                            .then(function (vi) {
                                                return _db.remove(ki, vi._rev);
                                            }, function (err) {
                                                if (err.status !== 404) {
                                                    throw err;
                                                }
                                            });
                                    }));
                                });
                            }, Promise.resolve()).then(function () {
                                return ri;
                            });
                        } else {
                            vk = target.className + '#' + target._getId();
                            return _db.get(vk)
                                .then(function (vi) {
                                    return _db.remove(vk, vi._rev);
                                }, function (err) {
                                    if (err.status !== 404) {
                                        throw err;
                                    }
                                })
                                .then(function () {
                                    return ri;
                                });
                        }
                    }, function (err) {
                        if (err.code === Parse.Error.AGGREGATE_ERROR) {
                            return err.errors.reduce(function (pmi, eri) {
                                return pmi.then(function () {
                                    if (eri.code === Parse.Error.OBJECT_NOT_FOUND) {
                                        var ki = eri.object.className + '#' + eri.object._getId();

                                        Parse.Database.trigger('missingObject', eri.object);
                                        return _db.get(ki)
                                            .then(function (vi) {
                                                return _db.remove(ki, vi._rev);
                                            }, function (err) {
                                                if (err.status !== 404) {
                                                    throw err;
                                                }
                                            });
                                    }
                                });
                            }, Promise.resolve());
                        }
                        Parse.Database.trigger('error', err);
                        return Promise.reject(err);
                    });
            },
            save: function (target, options) {
                var vk, vob, className = target && target.className ? target.className : false,
                    toServer = options && options.toServer ? options.toServer : false;

                if (Array.isArray(target)) {
                    if (!target.length) {
                        return Promise.resolve([]);
                    }
                    return Promise.all(target.map(function (oi) {
                        return _dbAdapters.object.save(oi, options);
                    }));
                }
                if (toServer) {
                    delete options.toServer;
                }
                if (!toServer || !className || !_db.__collections[className] ||
                    (_db.__collections[className].mode === Parse.Database.SERVER_FIRST) &&
                    Parse.Database.onLine) {
                    vk = className + '#' + target._getId();

                    return _dbAdapters._object.save(target, options)
                        .then(function (rj) {

                            if (!target ||
                                !target.className ||
                                !_db.__collections[className]) {
                                return rj;
                            }

                            return Promise.resolve()
                                .then(function () {
                                    var nid;
                                    vob = rj.toJSON();
                                    vob.className = className;
                                    nid = vob.className + '#' + rj._getId();
                                    if (vk === nid) {
                                        return Promise.resolve();
                                    }
                                    return _db.get(vk)['catch'](function () {
                                        return false;
                                    })
                                        .then(function (toPurge) {
                                            vk = nid;
                                            if (!toPurge) {
                                                return;
                                            }
                                            return _db.remove(toPurge);
                                        });
                                }).then(function () {
                                    return _db.upsert(vk, vob)
                                        .then(function () {
                                            return rj;
                                        });
                                });

                        }, function (err) {
                            if (!className || !_db.__collections[className]) {
                                return Promise.reject(err);
                            }
                            if (err && err.code) {

                                if ((err.code === 209) ||
                                    (err.code === 142) ||
                                    (err.code === 137) ||
                                    (err.code === 119) ||
                                    (err.code === 111) ||
                                    (err.code === 106) ||
                                    (err.code === 104) ||
                                    (err.code === 103)) {
                                    Parse.Database.trigger('error', err);
                                    return;
                                }
                            }
                            vob = target.toJSON();
                            vob.className = className;
                            vk = target.className + '#' + target._getId();
                            return _db.upsert(vk, vob)
                                .then(function () {
                                    return target;
                                });
                        });
                }

                if (!className || !_db.__collections[className]) {
                    return _dbAdapters._object.save(target, options);
                }
                vob = target.toJSON();
                vob.className = className;
                vk = target.className + '#' + target._getId();

                return _db.upsert(vk, vob)
                    .then(function () {
                        return _dbAdapters._object.save(target, options)
                            .then(function (rid) {
                                var nid = target.className + '#' + rid._getId();
                                return Promise.resolve()
                                    .then(function () {
                                        if (nid === vk) {
                                            return;
                                        }
                                        return _db.get(vk)
                                            .then(function (doc) {
                                                return _db.remove(doc);
                                            });
                                    })
                                    .then(function () {
                                        vob = rid.toJSON();
                                        vob.className = className;
                                        return _db.upsert(nid, vob);
                                    })
                                    .then(function () {
                                        return rid;
                                    });
                            }, function (err) {
                                // todo : mark unsaved
                                Parse.Database.trigger('unsaved', target);
                                return Promise.reject(err);
                            });
                    });
            },
            fetch: function (target, forceFetch, options) {
                var srvSearch = !_db.__collections[className] ||
                    _db.__collections[className].mode === Parse.Database.SERVER_FIRST ||
                    _db.__collections[className].updatedAt === 0;

                if (options && options.fromServer) {
                    delete options.fromServer;
                    srvSearch = true;
                }
                if (!srvSearch) {
                    return _db._object.fetch(target, forceFetch, options);
                }
                if (Array.isArray(target)) {
                    var ids = [], objs = [], cnm, results = [], error;
                    target.forEach(function (el, i) {
                        if (error) {
                            return;
                        }
                        if (!className) {
                            className = el.className;
                        }
                        if (className !== el.className) {
                            error = new Parse.Error(
                                Parse.Error.INVALID_CLASS_NAME,
                                'All objects should be of the same class'
                            );
                        }
                        if (!el.id) {
                            error = new Parse.Error(
                                Parse.Error.MISSING_OBJECT_ID,
                                'All objects must have an ID'
                            );
                        }
                        ids.push(el.id);
                        objs.push(el);
                        results.push(el);
                    });
                    if (error) {
                        return Promise.reject(error);
                    }
                    var query = new Parse.Query(className);
                    query.containedIn('objectId', ids);
                    query._limit = ids.length;
                    return query.find(options)
                        .then(function (objects) {
                            var idMap = {};
                            objects.forEach(function (o) {
                                idMap[o.id] = o;
                            });

                            for (var i = 0; i < objs.length; i++) {
                                var obj = objs[i];
                                if (!obj || !obj.id || !idMap[obj.id]) {
                                    if (forceFetch) {
                                        return Promise.reject(
                                            new Parse.Error(
                                                Parse.Error.OBJECT_NOT_FOUND,
                                                'All objects must exist on the server.'
                                            )
                                        );
                                    }
                                }
                            }
                            if (!singleInstance) {
                                // If single instance objects are disabled, we need to replace the
                                for (var ij = 0; ij < results.length; ij++) {
                                    var obji = results[ij];
                                    if (obji && obji.id && idMap[obji.id]) {
                                        var id = obji.id;
                                        obji._finishFetch(idMap[id].toJSON());
                                        results[ij] = idMap[id];
                                    }
                                }
                            }
                            return Promise.resolve(results);
                        });
                } else {
                    var ti = target.className + '#' + target._getId();
                    return _db.get(ti)
                        .then(function (obi) {
                            if (target instanceof Parse.Object) {
                                target._clearPendingOps();
                                target._clearServerData();
                                if (obi._id) {
                                    delete obi._id;
                                }
                                if (obi._rev) {
                                    delete obi._rev;
                                }
                                target._finishFetch(obi);
                            }
                            return target;
                        },
                            function (err) {
                                return target;
                            });
                }
            }
        },
        query: {
            find: function (className, src, opt) {
                var srvSearch = !_db.__collections[className] ||
                    _db.__collections[className].mode === Parse.Database.SERVER_FIRST ||
                    _db.__collections[className].updatedAt === 0,
                    forceServer = false;

                if (opt && opt.fromServer) {
                    srvSearch = true;
                    forceServer = true;
                    delete opt.fromServer;
                }

                if (!srvSearch) {
                    return _query_local(className, src, opt);
                }

                return _dbAdapters._query.find(className, src, opt)
                    .then(function (rz) {
                        if (!_db.__collections[className] || !rz.results.length) {
                            return rz;
                        }
                        var vms, pms;

                        vms = rz.results.map(function (ri) {
                            ri.className = ri.className || className;
                            ri._id = ri._id || className + '#' + ri.objectId;
                            return ri;
                        });
                        pms = opt && opt.beforeSaveLocal ? opt.beforeSaveLocal(vms) : Promise.resolve();
                        return pms.then(function () {
                            var vck = vms.chunk(5);
                            return vck.reduce(function (opm, chv) {
                                return opm.then(function () {
                                    return Promise.all(chv.map(function (ri) {
                                        var vid = className + '#' + ri.objectId;
                                        return _db.upsert(vid, function (odc) {
                                            return (!odc || (odc.updatedAt === ri.updatedAt)) ? false : ri;
                                        });
                                    }));
                                });
                            }, Promise.resolve());
                        }).then(function () {
                            return rz;
                        });
                    }, function (eri) {
                        if (eri && (eri.code === 100 || eri.code === 107) && !forceServer) {
                            return _query_local(className, src, opt);
                        }
                        return Promise.reject(eri);
                    });
            }
        }
    };


    function _db_upsertInner(db, docId, diffFun) {
        if (typeof docId !== 'string') {
            return Promise.reject(new Error('doc id is required'));
        }

        return db.get(docId)["catch"](function (err) {
            /* istanbul ignore next */
            if (err.status !== 404) {
                throw err;
            }
            return {};
        }).then(function (doc) {
            // the user might change the _rev, so save it for posterity
            var docRev = doc._rev;
            var newDoc = (typeof diffFun === 'function' ? diffFun(doc) : diffFun);

            if (!newDoc) {
                // if the diffFun returns falsy, we short-circuit as
                // an optimization
                return { updated: false, rev: docRev, id: docId };
            }

            // users aren't allowed to modify these values,
            // so reset them here
            newDoc._id = docId;
            newDoc._rev = docRev;
            return _db_tryAndPut(db, newDoc, diffFun);
        });
    }

    function _db_tryAndPut(db, doc, diffFun) {
        return db.put(doc).then(function (res) {
            return {
                updated: true,
                rev: res.rev,
                id: doc._id
            };
        }, function (err) {
            /* istanbul ignore next */
            if (err.status !== 409) {
                throw err;
            }
            return _db_upsertInner(db, doc._id, diffFun);
        });
    }

    function _db_upsert(docId, diffFun, cb) {
        var db = this,
            promise = _db_upsertInner(db, docId, diffFun);
        if (typeof cb !== 'function') {
            return promise;
        }
        promise.then(function (resp) {
            cb(null, resp);
        }, cb);
    }

    function _db_putIfNotExists(docId, doc, cb) {
        var db = this;

        if (typeof docId !== 'string') {
            cb = doc;
            doc = docId;
            docId = doc._id;
        }

        var diffFun = function (existingDoc) {
            if (existingDoc._rev) {
                return false; // do nothing
            }
            return doc;
        };

        var promise = _db_upsertInner(db, docId, diffFun);
        if (typeof cb !== 'function') {
            return promise;
        }
        promise.then(function (resp) {
            cb(null, resp);
        }, cb);
    }

    function getDatabase() {
        return _db ? Promise.resolve(_db) : _configureDbApp();
    }

    function _configureDbApp(options) {
        _config = options || {};
        _config.database = _config.database || {};
        _config.collections = _config.collections || {};

        _config.database.adapter = _config.database.adapter ||
            (typeof cordova !== 'undefined' && (cordova.platformId === 'browser' ||
                (typeof sqlitePlugin === 'undefined') || (typeof 'openDatabase' === 'undefined') ? 'idb' : 'cordova-sqlite'));

        if (_config.database.adapter === 'cordova-sqlite') {
            if (typeof PouchDB.adapters['cordova-sqlite'] === 'undefined') {
                delete _config.database.adapter;
            } else {
                _config.database.location = _config.database.location || 'default';
            }
        }
        _config.name = _config.name || (Parse.applicationId || 'boxapp') + '-db';

        _db = new PouchDB(_config.name, _config.database);
        _db.__collections = {};

        return Promise.all(Object.keys(_config.collections)
            .map(function (mk) {
                var docId = '_local/db-col-' + mk;

                return _db.get(docId)["catch"](function (err) {
                    if (err.status !== 404) {
                        throw err;
                    }
                    return _db_tryAndPut(_db, { _id: docId, updatedAt: 0 }, false);
                }).then(function (doc) {
                    var md = _config.collections[mk];
                    if (md === Parse.Database.APPLICATION_FIRST ||
                        md === Parse.Database.SERVER_FIRST) {
                        md = { mode: md };
                    }
                    _db.__collections[mk] = extend(doc, md);
                    md.index = md.index || ['className'];

                    return md.index.reduce(function (pms, ik) {
                        return pms.then(function () {
                            var ifl = ik.split(',');
                            if (ifl.indexOf('className') === -1) {
                                ifl.push('className');
                            }
                            return _db.createIndex({ index: { fields: ifl } });
                        });

                    }, Promise.resolve());
                });
            }))
            .then(function () {
                _dbAdapters._query = Parse.CoreManager.getQueryController();
                _dbAdapters._object = Parse.CoreManager.getObjectController();

                _dbAdapters.query.aggregate = _dbAdapters._query.aggregate;

                Parse.CoreManager.setQueryController(_dbAdapters.query);
                Parse.CoreManager.setObjectController(_dbAdapters.object);

                Parse.CoreManager.setStorageController({
                    async: 1,
                    getItemAsync: function (path) {
                        return _db.get('_local/' + path);
                    },
                    setItemAsync: function (path, value) {
                        return _db.setItem('_local/' + path, value);
                    },
                    removeItemAsync: function (path) {
                        return _db.get('_local/' + rid)
                            .then(function (rd) {
                                return _db.remove(rd);
                            });
                    },
                    clear: function () {
                        return Promise.reject('invalid operation');
                    }
                });
                return _db;
            });
    }


    function _connectionState() {
        if (navigator.connection && typeof navigator.connection.getInfo === 'function') {
            navigator.connection.getInfo(function (cnt) {

                if (app.connection !== cnt) {
                    if (cnt === _connectionType.NONE ||
                        (cnt === _connectionType.UNKNOWN && device && device.platform !== 'browser')) {
                        Parse.Database.onLine = false;
                    } else {
                        Parse.Database.onLine = true;
                    }
                }
            });
        } else {
            Parse.Database.onLine = !!navigator.onLine;
        }
    }


    function _sync_To_Server(options) {

        if (!app || !app.online) {
            return Promise.resolve(false);
        }
        return new Promise(function (resolve, reject) {
            return _db.get('_local/synced_seq')['catch'](function (err) {
                if (err.status !== 404) {
                    throw err;
                }
                return { count: 0 };
            })
                .then(function (scnt) {
                    var sncParams = { since: scnt.count, include_docs: true },
                        chnd;

                    if (options && options.doc_ids) {
                        sncParams.doc_ids = options.doc_ids;
                    }
                    chnd = _db.changes(sncParams)
                        .on('complete', function (rzc) {
                            var i, obChanges = {}, ok;
                            for (i = 0; i < rzc.results.length; i++) {
                                ok = rzc.results[i].id.split('#');
                                if (ok.length === 2 && _db.__collections[ok[0]]) {
                                    obChanges[ok[0]] = obChanges[ok[0]] || { updated: [], deleted: [] };
                                    if (rzc.results[i].deleted) {
                                        if ((ok[1].indexOf('local') !== 0) && (ok[1].indexOf('new') !== 0)) {
                                            obChanges[ok[0]].deleted.push(ok[1]);
                                        }
                                    } else {
                                        obChanges[ok[0]].updated.push(ok[1]);
                                    }
                                }
                            }
                            // chnd.cancel();

                            return Object.keys(obChanges).reduce(function (pms, clName) {
                                return pms.then(function () {
                                    return _try_sync_to_server(clName, obChanges[clName]);
                                });
                            }, Promise.resolve())
                                .then(function () {
                                    if (options && options.doc_ids) {
                                        return;
                                    }
                                    return _db.compact()
                                        .then(function () {
                                            return _db.upsert('_local/synced_seq', { count: rzc.last_seq });
                                        });
                                }).then(resolve, reject);
                        })
                        .on('error', reject);
                });
        });
    }

    function _syncToLocal(options) {
        var obs = {};

        return (options && options.collections ? [options.collections] : Object.keys(_db.__collections).chunk(5)).reduce(function (pms, ark) {
            return pms.then(function () {
                return Promise.all(ark.map(function (cn) {
                    var toPurge,
                        ckn = '_local/db-col-' + cn;

                    if (options && (typeof options.progress === 'function')) {
                        options.progress({ className: cn, status: 0 });
                    }
                    return Promise.resolve()
                        .then(function () {
                            if (options && !options.forceReload) {
                                return _db.get(ckn)["catch"](function (err) {
                                    if (err.status !== 404) {
                                        throw err;
                                    }
                                    return { updatedAt: 0 };
                                });
                            }
                            return _db.find({
                                selector: { className: cn },
                                fields: ['_id', '_rev']
                            })
                                .then(function (rdcs) {
                                    var i;
                                    if (!rdcs.docs || !rdcs.docs.length) {
                                        return;
                                    }
                                    toPurge = rdcs.docs.map(function (mi) {
                                        mi._deleted = true;
                                        return mi;
                                    });

                                    if (options && (typeof options.progress === 'function')) {
                                        options.progress({ className: cn, status: 1 });
                                    }
                                    //return _db.bulkDocs(rdcs.docs)['catch'](function (err) {
                                    //    console.error(err);
                                    //});
                                })
                                .then(function () {
                                    return { updatedAt: 0 };
                                });
                        })
                        .then(function (doc) {
                            var pms, npq,
                                pqs = { count: true, limit: 0 };

                            if (doc.updatedAt && (!options || !options.forceReload)) {
                                npq = new Parse.Query(cn);
                                npq.greaterThan('updatedAt', new Date(doc.updatedAt));
                                pqs.where = npq.toJSON().where;
                            }
                            if (options && (typeof options.progress === 'function')) {
                                options.progress({ className: cn, status: 2 });
                            }
                            return _dbAdapters.query.find(cn, pqs, {
                                fromServer: true
                            })
                                .then(function (rd) {
                                    delete pqs.count;
                                    pqs.limit = rd.count;
                                    if (options && (typeof options.progress === 'function')) {
                                        options.progress({ className: cn, status: 3, count: rd.count });
                                    }
                                    if (!rd.count) {
                                        return Promise.resolve(doc.updatedAt);
                                    }
                                    return _dbAdapters.query.find(cn, pqs, {
                                        fromServer: true,
                                        beforeSaveLocal: function () {
                                            return toPurge ? _db.bulkDocs(toPurge)['catch'](function (err) {
                                                console.error(err);
                                            }) : Promise.resolve();
                                        }
                                    })
                                        .then(function (riz) {
                                            var vi = doc.updatedAt, i, cid;
                                            for (i = 0; i < riz.results.length; i++) {
                                                cid = new Date(riz.results[i].updatedAt);

                                                if (vi < cid.getTime()) {
                                                    vi = cid.getTime();
                                                }
                                            }
                                            return vi;
                                        });
                                })
                                .then(function (update) {
                                    if (options && (typeof options.progress === 'function')) {
                                        options.progress({ className: cn, status: 4 });
                                    }
                                    if (update && (update === doc.updatedAt)) {
                                        return Promise.resolve(obs);
                                    }
                                    doc.updatedAt = update;
                                    return _db.upsert(ckn, doc)
                                        .then(function (rd) {
                                            obs[cn] = rd.updated ? doc.updatedAt : false;
                                            return obs;
                                        });
                                });
                        });
                }));
            });
        }, Promise.resolve())
            .then(function () {
                return obs;
            });
    }

    function isDirty(options) {
        return _db.get('_local/synced_seq')['catch'](function (err) {
            if (err.status !== 404) {
                throw err;
            }
            return { count: 0 };
        })
            .then(function (scnt) {
                var sncParams = { since: scnt.count };

                if (options && options.doc_ids) {
                    sncParams.doc_ids = options.doc_ids;
                }
                return new Promise(function (resolve, reject) {
                    _db.changes(sncParams)
                        .on('complete', function (rzc) {
                            return resolve(rzc && (rzc.last_seq !== scnt.count));
                        })
                        .on('error', reject);
                });
            });
    }

    var Events = {};
    var eventSplitter = /\s+/;

    // A private global variable to share between listeners and listenees.
    var _listening;

    // Iterates over the standard `event, callback` (as well as the fancy multiple
    // space-separated events `"change blur", callback` and jQuery-style event
    // maps `{event: callback}`).
    var eventsApi = function (iteratee, events, name, callback, opts) {
        var i = 0, names;
        if (name && typeof name === 'object') {
            // Handle event maps.
            if (callback !== void 0 && 'context' in opts && opts.context === void 0) opts.context = callback;
            for (names = Object.keys(name); i < names.length; i++) {
                events = eventsApi(iteratee, events, names[i], name[names[i]], opts);
            }
        } else if (name && eventSplitter.test(name)) {
            // Handle space-separated event names by delegating them individually.
            for (names = name.split(eventSplitter); i < names.length; i++) {
                events = iteratee(events, names[i], callback, opts);
            }
        } else {
            // Finally, standard events.
            events = iteratee(events, name, callback, opts);
        }
        return events;
    };

    // Bind an event to a `callback` function. Passing `"all"` will bind
    // the callback to all events fired.
    Events.on = function (name, callback, context) {
        this._events = eventsApi(onApi, this._events || {}, name, callback, {
            context: context,
            ctx: this,
            listening: _listening
        });

        if (_listening) {
            var listeners = this._listeners || (this._listeners = {});
            listeners[_listening.id] = _listening;
            // Allow the listening to use a counter, instead of tracking
            // callbacks for library interop
            _listening.interop = false;
        }

        return this;
    };

    // Inversion-of-control versions of `on`. Tell *this* object to listen to
    // an event in another object... keeping track of what it's listening to
    // for easier unbinding later.
    Events.listenTo = function (obj, name, callback) {
        if (!obj) return this;
        var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
        var listeningTo = this._listeningTo || (this._listeningTo = {});
        var listening = _listening = listeningTo[id];

        // This object is not listening to any other events on `obj` yet.
        // Setup the necessary references to track the listening callbacks.
        if (!listening) {
            this._listenId || (this._listenId = _.uniqueId('l'));
            listening = _listening = listeningTo[id] = new Listening(this, obj);
        }

        // Bind callbacks on obj.
        var error = tryCatchOn(obj, name, callback, this);
        _listening = void 0;

        if (error) throw error;
        // If the target obj is not Backbone.Events, track events manually.
        if (listening.interop) listening.on(name, callback);

        return this;
    };

    // The reducing API that adds a callback to the `events` object.
    var onApi = function (events, name, callback, options) {
        if (callback) {
            var handlers = events[name] || (events[name] = []);
            var context = options.context, ctx = options.ctx, listening = options.listening;
            if (listening) listening.count++;

            handlers.push({ callback: callback, context: context, ctx: context || ctx, listening: listening });
        }
        return events;
    };

    // An try-catch guarded #on function, to prevent poisoning the global
    // `_listening` variable.
    var tryCatchOn = function (obj, name, callback, context) {
        try {
            obj.on(name, callback, context);
        } catch (e) {
            return e;
        }
    };

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `name` is null, removes all bound
    // callbacks for all events.
    Events.off = function (name, callback, context) {
        if (!this._events) return this;
        this._events = eventsApi(offApi, this._events, name, callback, {
            context: context,
            listeners: this._listeners
        });

        return this;
    };

    // Tell this object to stop listening to either specific events ... or
    // to every object it's currently listening to.
    Events.stopListening = function (obj, name, callback) {
        var listeningTo = this._listeningTo;
        if (!listeningTo) return this;

        var ids = obj ? [obj._listenId] : Object.keys(listeningTo);
        for (var i = 0; i < ids.length; i++) {
            var listening = listeningTo[ids[i]];

            // If listening doesn't exist, this object is not currently
            // listening to obj. Break out early.
            if (!listening) break;

            listening.obj.off(name, callback, this);
            if (listening.interop) listening.off(name, callback);
        }
        if (_.isEmpty(listeningTo)) this._listeningTo = void 0;

        return this;
    };

    // The reducing API that removes a callback from the `events` object.
    var offApi = function (events, name, callback, options) {
        if (!events) return;

        var context = options.context, listeners = options.listeners;
        var i = 0, names;

        // Delete all event listeners and "drop" events.
        if (!name && !context && !callback) {
            for (names = Object.keys(listeners); i < names.length; i++) {
                listeners[names[i]].cleanup();
            }
            return;
        }

        names = name ? [name] : Object.keys(events);
        for (; i < names.length; i++) {
            name = names[i];
            var handlers = events[name];

            // Bail out if there are no events stored.
            if (!handlers) break;

            // Find any remaining events.
            var remaining = [];
            for (var j = 0; j < handlers.length; j++) {
                var handler = handlers[j];
                if (
                    callback && callback !== handler.callback &&
                    callback !== handler.callback._callback ||
                    context && context !== handler.context
                ) {
                    remaining.push(handler);
                } else {
                    var listening = handler.listening;
                    if (listening) listening.off(name, callback);
                }
            }

            // Replace events if there are any remaining.  Otherwise, clean up.
            if (remaining.length) {
                events[name] = remaining;
            } else {
                delete events[name];
            }
        }

        return events;
    };

    // Bind an event to only be triggered a single time. After the first time
    // the callback is invoked, its listener will be removed. If multiple events
    // are passed in using the space-separated syntax, the handler will fire
    // once for each event, not once for a combination of all events.
    Events.once = function (name, callback, context) {
        // Map the event into a `{event: once}` object.
        var events = eventsApi(onceMap, {}, name, callback, _.bind(this.off, this));
        if (typeof name === 'string' && context == null) callback = void 0;
        return this.on(events, callback, context);
    };

    // Inversion-of-control versions of `once`.
    Events.listenToOnce = function (obj, name, callback) {
        // Map the event into a `{event: once}` object.
        var events = eventsApi(onceMap, {}, name, callback, _.bind(this.stopListening, this, obj));
        return this.listenTo(obj, events);
    };

    // Reduces the event callbacks into a map of `{event: onceWrapper}`.
    // `offer` unbinds the `onceWrapper` after it has been called.
    var onceMap = function (map, name, callback, offer) {
        if (callback) {
            var once = map[name] = _.once(function () {
                offer(name, once);
                callback.apply(this, arguments);
            });
            once._callback = callback;
        }
        return map;
    };

    // Trigger one or many events, firing all bound callbacks. Callbacks are
    // passed the same arguments as `trigger` is, apart from the event name
    // (unless you're listening on `"all"`, which will cause your callback to
    // receive the true name of the event as the first argument).
    Events.trigger = function (name) {
        if (!this._events) return this;

        var length = Math.max(0, arguments.length - 1);
        var args = Array(length);
        for (var i = 0; i < length; i++) args[i] = arguments[i + 1];

        eventsApi(triggerApi, this._events, name, void 0, args);
        return this;
    };

    // Handles triggering the appropriate event callbacks.
    var triggerApi = function (objEvents, name, callback, args) {
        if (objEvents) {
            var events = objEvents[name];
            var allEvents = objEvents.all;
            if (events && allEvents) allEvents = allEvents.slice();
            if (events) triggerEvents(events, args);
            if (allEvents) triggerEvents(allEvents, [name].concat(args));
        }
        return objEvents;
    };

    // A difficult-to-believe, but optimized internal dispatch function for
    // triggering events. Tries to keep the usual cases speedy (most internal
    // Backbone events have 3 arguments).
    var triggerEvents = function (events, args) {
        var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
        switch (args.length) {
            case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
            case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
            case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
            case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
            default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
        }
    };

    // A listening class that tracks and cleans up memory bindings
    // when all callbacks have been offed.
    var Listening = function (listener, obj) {
        this.id = listener._listenId;
        this.listener = listener;
        this.obj = obj;
        this.interop = true;
        this.count = 0;
        this._events = void 0;
    };

    Listening.prototype.on = Events.on;

    // Offs a callback (or several).
    // Uses an optimized counter if the listenee uses Backbone.Events.
    // Otherwise, falls back to manual tracking to support events
    // library interop.
    Listening.prototype.off = function (name, callback) {
        var cleanup;
        if (this.interop) {
            this._events = eventsApi(offApi, this._events, name, callback, {
                context: void 0,
                listeners: void 0
            });
            cleanup = !this._events;
        } else {
            this.count--;
            cleanup = this.count === 0;
        }
        if (cleanup) this.cleanup();
    };

    // Cleans up memory bindings between the listener and the listenee.
    Listening.prototype.cleanup = function () {
        delete this.listener._listeningTo[this.obj._listenId];
        if (!this.interop) delete this.obj._listeners[this.id];
    };

    // Aliases for backwards compatibility.
    Events.bind = Events.on;
    Events.unbind = Events.off;
    Events.emit = Events.trigger;

    PouchDB.plugin({
        upsert: _db_upsert,
        putIfNotExists: _db_putIfNotExists
    });

    var objectSet = Parse.Object.prototype.set;

    extend(Parse.Object.prototype, Events, {
        set: function () {
            var varg = ['change'].concat(Array.prototype.slice.call(arguments));
            objectSet.apply(this, arguments);
            this.trigger.apply(this, varg);
        }
    });

    Parse.Events = Events;

    Parse.Database = {
        APPLICATION_FIRST: 'APPLICATION_FIRST',
        SERVER_FIRST: 'SERVER_FIRST',
        onLine : !!navigator.onLine,
        getDatabase: getDatabase,
        configure: _configureDbApp,
        syncToServer: _sync_To_Server,
        sync: sync,
        isDirty: _isDirty
    };

    extend(Parse.Database, Events);

    if (document && typeof document.addEventListener === 'function') {
        document.addEventListener("online", _connectionState, false);
        document.addEventListener("offline", _connectionState, false);
    }
}));