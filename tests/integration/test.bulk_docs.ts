﻿// Type definitions for pouchdb v3.4.0
// Project: http://pouchdb.com/, https://github.com/pouchdb/pouchdb
// Definitions by: Andy Brown <https://github.com/AGBrown> (https://github.com/AGBrown/pouchdb.d.ts)
// Definitions: https://github.com/borisyankov/DefinitelyTyped
// THIS FILE:
//  This file recreates the tests in:
//    pouchdb/tests/integration/test.bulk_docs.js

/// <reference path="../../typings/chai/chai.d.ts" />
/// <reference path="../../typings/mocha/mocha.d.ts" />
/// <reference path="../../pouchdb.d.ts" />
/// <reference path="common.ts" />
/// <reference path="utils.d.ts" />
'use strict';

interface NewTestDoc extends pouchdb.api.methods.NewDoc {
  integer: number;
  string: string;
}

interface ExistingTestDoc extends pouchdb.api.methods.ExistingDoc, NewTestDoc { }

var adapters: string[] = ['local', 'http'];

function makeDocs<R extends NewTestDoc>(start: number, end?: number, templateDoc?: string): R[] {
  var templateDocSrc = templateDoc ? JSON.stringify(templateDoc) : '{}';
  if (end === undefined) {
    end = start;
    start = 0;
  }
  var docs = [];
  for (var i = start; i < end; i++) {
    /*jshint evil:true */
    var newDoc = eval('(' + templateDocSrc + ')');
    newDoc._id = i.toString();
    newDoc.integer = i;
    newDoc.string = i.toString();
    docs.push(newDoc);
  }
  return docs;
}

adapters.forEach(function (adapter) {
  describe('test.bulk_docs.js-' + adapter, function () {

    var dbs: {name?:string} = {};

    beforeEach(function (done) {
      dbs.name = testUtils.adapterUrl(adapter, 'testdb');
      testUtils.cleanup([dbs.name], done);
    });

    after(function (done) {
      testUtils.cleanup([dbs.name], done);
    });

    var authors = [
      { name: 'Dale Harvey', commits: 253 },
      { name: 'Mikeal Rogers', commits: 42 },
      { name: 'Johannes J. Schmidt', commits: 13 },
      { name: 'Randall Leeds', commits: 9 }
    ];

    it('Testing bulk docs', (done) => {
      var db = new PouchDB(dbs.name, noop);
      var docs = makeDocs(5);
      db.bulkDocs({ docs: docs }, (err, results) => {
        results.should.have.length(5, 'results length matches');
        for (var i = 0; i < 5; i++) {
          results[i].id.should.equal(docs[i]._id, 'id matches');
          should.exist(results[i].rev, 'rev is set');
          // Update the doc
          (<ExistingTestDoc>docs[i])._rev = (<BulkDocsInfo>results[i]).rev;
          (<ExistingTestDoc>docs[i]).string = docs[i].string + '.00';
        }
        db.bulkDocs({ docs: <ExistingTestDoc[]>docs }, (err, results) => {
          results.should.have.length(5, 'results length matches');
          for (i = 0; i < 5; i++) {
            results[i].id.should.equal(i.toString(), 'id matches again');
            // set the delete flag to delete the docs in the next step
            (<ExistingTestDoc>docs[i])._rev = (<BulkDocsInfo>results[i]).rev;
            (<ExistingTestDoc>docs[i])._deleted = true;
          }
          db.put(docs[0], (err, doc) => {
            db.bulkDocs({ docs: <ExistingTestDoc[]>docs }, (err, results) => {
              (<BulkDocsError>results[0]).name.should.equal(
                'conflict', 'First doc should be in conflict');
              should.not.exist((<BulkDocsInfo>results[0]).rev, 'no rev in conflict');
              for (i = 1; i < 5; i++) {
                (<BulkDocsInfo>results[i]).id.should.equal(i.toString());
                should.exist((<BulkDocsInfo>results[i]).rev);
              }
              done();
            });
          });
        });
      });
    });

    it('No id in bulk docs', (done) => {
      var db = new PouchDB(dbs.name, noop);
      var newdoc: pouchdb.api.methods.NewDoc = {
        '_id': 'foobar',
        'body': 'baz'
      };
      db.put(newdoc, (err, doc) => {
        should.exist(doc.ok);
        var docs = [
          {
            '_id': newdoc._id,
            '_rev': (<pouchdb.api.methods.ExistingDoc>newdoc)._rev,
            'body': 'blam'
          },
          {
            '_id': newdoc._id,
            '_rev': (<pouchdb.api.methods.ExistingDoc>newdoc)._rev,
            '_deleted': true
          }
        ];
        db.bulkDocs({ docs: docs }, (err, results) => {
          results[0].should.have.property('name', 'conflict');
          results[1].should.have.property('name', 'conflict');
          done();
        });
      });
    });

    it('No _rev and new_edits=false', (done) => {
      var db = new PouchDB(dbs.name, noop);
      var docs: pouchdb.api.methods.NewDoc[] = [{
        _id: 'foo',
        integer: 1
      }];
      db.bulkDocs({ docs: docs }, { new_edits: false }, (err, res) => {
        should.exist(err, 'error reported');
        done();
      });
    });

    it('Test empty bulkDocs', () => {
      var db = new PouchDB(dbs.name);
      return db.bulkDocs([]);
    });

    it('Test many bulkDocs',() => {
      var db = new PouchDB(dbs.name);
      var docs: pouchdb.api.methods.NewDoc[] = [];
      for (var i = 0; i < 201; i++) {
        docs.push({ _id: i.toString() });
      }
      return db.bulkDocs(docs);
    });

    it('Test errors on invalid doc id', (done) => {
      var db = new PouchDB(dbs.name, noop);
      var docs = [{
        '_id': '_invalid',
        foo: 'bar'
      }];
      db.bulkDocs({ docs: docs },(err, info) => {
        (<BulkDocsError>err).status.should.equal(PouchDB.Errors.RESERVED_ID.status,
          'correct error status returned');
        (<BulkDocsError>err).message.should.equal(PouchDB.Errors.RESERVED_ID.message,
          'correct error message returned');
        should.not.exist(info, 'info is empty');
        done();
      });
    });

    it('Test two errors on invalid doc id', (done) => {
      var docs: pouchdb.api.methods.BaseDoc[] = [
        { '_id': '_invalid', foo: 'bar' },
        { '_id': 123, foo: 'bar' }
      ];

      var db = new PouchDB(dbs.name, noop);
      db.bulkDocs({ docs: docs },(err, info) => {
        (<BulkDocsError>err).status.should.equal(PouchDB.Errors.RESERVED_ID.status,
          'correct error returned');
        (<BulkDocsError>err).message.should.equal(PouchDB.Errors.RESERVED_ID.message,
          'correct error message returned');
        should.not.exist(info, 'info is empty');
        done();
      });
    });

    it('No docs', (done) => {
      var db = new PouchDB(dbs.name, noop);
      db.bulkDocs(<pouchdb.api.methods.bulkDocs.DocumentPouch<pouchdb.api.methods.NewDoc>>
        <{}>{ 'doc': [{ 'foo': 'bar' }] }, (err, result) => {
          (<BulkDocsError>err).status.should.equal(PouchDB.Errors.MISSING_BULK_DOCS.status,
            'correct error returned');
          (<BulkDocsError>err).message.should.equal(PouchDB.Errors.MISSING_BULK_DOCS.message,
            'correct error message returned');
        done();
      });
    });

    it('Jira 911', (done) => {
      var db = new PouchDB(dbs.name, noop);
      var docs = [
        { '_id': '0', 'a': 0 },
        { '_id': '1', 'a': 1 },
        { '_id': '1', 'a': 1 },
        { '_id': '3', 'a': 3 }
      ];
      db.bulkDocs({ docs: docs },(err, results) => {
        (<BulkDocsInfo>results[1]).id.should.equal('1', 'check ordering');
        should.not.exist((<BulkDocsError>results[1]).name, 'first id succeded');
        (<BulkDocsError>results[2]).name.should.equal('conflict', 'second conflicted');
        results.should.have.length(4, 'got right amount of results');
        done();
      });
    });

    it('Test multiple bulkdocs', (done) => {
      var db = new PouchDB(dbs.name, noop);
      db.bulkDocs({ docs: authors }, (err, res) => {
        db.bulkDocs({ docs: authors }, (err, res) => {
          db.allDocs((err, result) => {
            result.total_rows.should.equal(8, 'correct number of results');
            done();
          });
        });
      });
    });

    it('#2935 new_edits=false correct number', () => {
      interface LooseDoc extends pouchdb.api.methods.bulkDocs.MixedDoc {
        [x: string]: any;
      }
      var docs: LooseDoc[] = [
        {
          "_id": "EE35E",
          "_rev": "4-70b26",
          "_deleted": true,
          "_revisions": {
            "start": 4,
            "ids": ["70b26", "9f454", "914bf", "7fdf8"]
          }
        }, {
          "_id": "EE35E",
          "_rev": "3-f6d28",
          "_revisions": { "start": 3, "ids": ["f6d28", "914bf", "7fdf8"] }
        }
      ];

      var db = new PouchDB(dbs.name);

      return db.bulkDocs(<pouchdb.api.methods.bulkDocs.DocumentPouchAndOptions<LooseDoc>>{ docs: docs, new_edits: false }).then((res) => {
        res.should.deep.equal([]);
        return db.allDocs();
      }).then((res) => {
        res.total_rows.should.equal(1);
        return db.info();
      }).then((info) => {
        info.doc_count.should.equal(1);
      });
    });

    it('#2935 new_edits=false correct number 2', () => {
      interface LooseDoc extends pouchdb.api.methods.bulkDocs.MixedDoc {
        [x: string]: any;
      }
      var docs = [
        {
          "_id": "EE35E",
          "_rev": "3-f6d28",
          "_revisions": { "start": 3, "ids": ["f6d28", "914bf", "7fdf8"] }
        }, {
          "_id": "EE35E",
          "_rev": "4-70b26",
          "_deleted": true,
          "_revisions": {
            "start": 4,
            "ids": ["70b26", "9f454", "914bf", "7fdf8"]
          }
        }
      ];

      var db = new PouchDB(dbs.name);

      return db.bulkDocs(<pouchdb.api.methods.bulkDocs.DocumentPouchAndOptions<LooseDoc>>{ docs: docs, new_edits: false }).then((res) => {
        res.should.deep.equal([]);
        return db.allDocs();
      }).then((res) => {
        res.total_rows.should.equal(1);
        return db.info();
      }).then((info) => {
        info.doc_count.should.equal(1);
      });
    });

    it('#2935 new_edits=false with single unauthorized', (done) => {

      testUtils.isCouchDB((isCouchDB) => {
        if (adapter !== 'http' || !isCouchDB) {
          return done();
        }

        var ddoc = {
          "_id": "_design/validate",
          "validate_doc_update": function (newDoc) {
            if (newDoc.foo === undefined) {
              throw { unauthorized: 'Document must have a foo.' };
            }
          }.toString()
        };

        var db = new PouchDB(dbs.name);

        db.put(ddoc).then(() => {
          return db.bulkDocs({
            docs: [
              {
                '_id': 'doc0',
                '_rev': '1-x',
                'foo': 'bar',
                '_revisions': {
                  'start': 1,
                  'ids': ['x']
                }
              }, {
                '_id': 'doc1',
                '_rev': '1-x',
                '_revisions': {
                  'start': 1,
                  'ids': ['x']
                }
              }, {
                '_id': 'doc2',
                '_rev': '1-x',
                'foo': 'bar',
                '_revisions': {
                  'start': 1,
                  'ids': ['x']
                }
              }
            ]
          }, { new_edits: false });
        }).then((res) => {
          res.should.have.length(1);
          should.exist((<BulkDocsError>res[0]).error);
          res[0].id.should.equal('doc1');
        }).then(done);
      });
    });

    //  todo: not sure how to handle res as an [] in this test
    //it('Bulk with new_edits=false', (done) => {
    //  var db = new PouchDB(dbs.name, noop);
    //  var docs = [{
    //      '_id': 'foo',
    //      '_rev': '2-x',
    //      '_revisions': {
    //        'start': 2,
    //        'ids': ['x', 'a']
    //      }
    //    }, {
    //      '_id': 'foo',
    //      '_rev': '2-y',
    //      '_revisions': {
    //        'start': 2,
    //        'ids': ['y', 'a']
    //      }
    //    }];
    //  db.bulkDocs({ docs: docs }, { new_edits: false }, (err, res) => {
    //    db.get('foo', { open_revs: 'all' }, (err, res) => {
    //      // todo: these lines
    //      //res.sort(function (a, b) {
    //      //  return a.ok._rev < b.ok._rev ? -1 :
    //      //    a.ok._rev > b.ok._rev ? 1 : 0;
    //      //});
    //      expect(res.length).to.equal(2);
    //      // todo: these lines
    //      //res[0].ok._rev.should.equal('2-x', 'doc1 ok');
    //      //res[1].ok._rev.should.equal('2-y', 'doc2 ok');
    //      done();
    //    });
    //  });
    //});

    it('Testing successive new_edits to the same doc', (done) => {

      var db = new PouchDB(dbs.name, noop);
      var docs = [{
        '_id': 'foo',
        '_rev': '1-x',
        '_revisions': {
          'start': 1,
          'ids': ['x']
        }
      }];

      db.bulkDocs({ docs: docs, new_edits: false }, (err, result) => {
        should.not.exist(err);
        db.bulkDocs({ docs: docs, new_edits: false }, (err, result) => {
          should.not.exist(err);
          db.get('foo', (err, res) => {
            res._rev.should.equal('1-x');
            done();
          });
        });
      });
    });

    // todo: not sure how to define x.error object
    //it('#3062 bulkDocs with staggered seqs', () => {
    //  return new PouchDB(dbs.name).then((db) => {
    //    var docs = [];
    //    for (var i = 10; i <= 20; i++) {
    //      docs.push({ _id: 'doc-' + i });
    //    }
    //    return db.bulkDocs({ docs: docs }).then((infos) => {
    //      docs.forEach((doc, i) => {
    //        doc._rev = infos[i].rev;
    //      });
    //      var docsToUpdate = docs.filter((doc, i) => {
    //        return i % 2 === 1;
    //      });
    //      docsToUpdate.reverse();
    //      return db.bulkDocs({ docs: docsToUpdate });
    //    }).then((infos) => {
    //        expect(infos.map((x) => {
    //          return { id: x.id, error: !!x.error, rev: (typeof x.rev) };
    //        })).to.deep.equal([
    //        { error: false, id: 'doc-19', rev: 'string' },
    //        { error: false, id: 'doc-17', rev: 'string' },
    //        { error: false, id: 'doc-15', rev: 'string' },
    //        { error: false, id: 'doc-13', rev: 'string' },
    //        { error: false, id: 'doc-11', rev: 'string' }
    //      ]);
    //    });
    //  });
    //});

    it('Testing successive new_edits to the same doc, different content',
      (done) => {

        var db = new PouchDB(dbs.name, noop);
        var docsA = [{
            '_id': 'foo',
            '_rev': '1-x',
            'bar': 'baz',
            '_revisions': {
              'start': 1,
              'ids': ['x']
            }
          }, {
            '_id': 'fee',
            '_rev': '1-x',
            '_revisions': {
              'start': 1,
              'ids': ['x']
            }
          }];

        var docsB = [{
            '_id': 'foo',
            '_rev': '1-x',
            'bar': 'zam', // this update should be rejected
            '_revisions': {
              'start': 1,
              'ids': ['x']
            }
          }, {
            '_id': 'faa',
            '_rev': '1-x',
            '_revisions': {
              'start': 1,
              'ids': ['x']
            }
          }];

        db.bulkDocs({ docs: docsA, new_edits: false }, (err, result) => {
          should.not.exist(err);
          db.changes({
            complete: (err, result) => {
              var ids = result.results.map((row) => {
                return row.id;
              });
              ids.should.include("foo");
              ids.should.include("fee");
              ids.should.not.include("faa");

              var update_seq = result.last_seq;
              db.bulkDocs({ docs: docsB, new_edits: false }, (err, result) => {
                should.not.exist(err);
                db.changes({
                  since: update_seq,
                  complete: (err, result) => {
                    var ids = result.results.map((row) => {
                      return row.id;
                    });
                    ids.should.not.include("foo");
                    ids.should.not.include("fee");
                    ids.should.include("faa");

                    db.get('foo', (err, res) => {
                      res._rev.should.equal('1-x');
                      (<pouchdb.test.integration.BarDoc>res).bar.should.equal("baz");
                      db.info((err, info) => {
                        info.doc_count.should.equal(3);
                        done();
                      });
                    });
                  }
                });
              });
            }
          });
        });
      });

    it('Testing successive new_edits to two doc', () => {

      var db = new PouchDB(dbs.name);
      var doc1 = {
        '_id': 'foo',
        '_rev': '1-x',
        '_revisions': {
          'start': 1,
          'ids': ['x']
        }
      };
      var doc2 = {
        '_id': 'bar',
        '_rev': '1-x',
        '_revisions': {
          'start': 1,
          'ids': ['x']
        }
      };

      return db.put(doc1, { new_edits: false }).then(() => {
        return db.put(doc2, { new_edits: false });
      }).then(() => {
        return db.put(doc1, { new_edits: false });
      }).then(() => {
        return db.get('foo');
      }).then(() => {
        return db.get('bar');
      });
    });

    //  todo: d.ts not sure how to handle allDocs with just keys specified
    it('Deletion with new_edits=false', () => {

      var db = new PouchDB(dbs.name);
      var doc1 = {
        '_id': 'foo',
        '_rev': '1-x',
        '_revisions': {
          'start': 1,
          'ids': ['x']
        }
      };
      var doc2 = {
        '_deleted': true,
        '_id': 'foo',
        '_rev': '2-y',
        '_revisions': {
          'start': 2,
          'ids': ['y', 'x']
        }
      };

      return db.put(doc1, { new_edits: false }).then(() => {
        return db.put(doc2, { new_edits: false });
      }).then(() => {
        return db.allDocs({ keys: ['foo'] });
      }).then((res) => {
        res.rows[0].value.rev.should.equal('2-y');
        res.rows[0].value.deleted.should.equal(true);
      });
    });

    it('Deletion with new_edits=false, no history', () => {

      var db = new PouchDB(dbs.name);
      var doc1 = {
        '_id': 'foo',
        '_rev': '1-x',
        '_revisions': {
          'start': 1,
          'ids': ['x']
        }
      };
      var doc2 = {
        '_deleted': true,
        '_id': 'foo',
        '_rev': '2-y'
      };

      return db.put(doc1, { new_edits: false }).then(() => {
        return db.put(doc2, { new_edits: false });
      }).then(() => {
        return db.allDocs({ keys: ['foo'] });
      }).then((res) => {
        res.rows[0].value.rev.should.equal('1-x');
        should.equal(!!res.rows[0].value.deleted, false);
      });
    });

    it('Modification with new_edits=false, no history', () => {

      var db = new PouchDB(dbs.name);
      var doc1 = {
        '_id': 'foo',
        '_rev': '1-x',
        '_revisions': {
          'start': 1,
          'ids': ['x']
        }
      };
      var doc2 = {
        '_id': 'foo',
        '_rev': '2-y'
      };

      return db.put(doc1, { new_edits: false }).then(() => {
        return db.put(doc2, { new_edits: false });
      }).then(() => {
        return db.allDocs({ keys: ['foo'] });
      }).then((res) => {
        res.rows[0].value.rev.should.equal('2-y');
      });
    });

    it('Deletion with new_edits=false, no history, no revisions',() => {

      var db = new PouchDB(dbs.name);
      var doc = {
        '_deleted': true,
        '_id': 'foo',
        '_rev': '2-y'
      };

      return db.put(doc, { new_edits: false }).then(() => {
        return db.allDocs({ keys: ['foo'] });
      }).then((res) => {
        res.rows[0].value.rev.should.equal('2-y');
        res.rows[0].value.deleted.should.equal(true);
      });
    });

    //  todo: not sure how to handle res as an [] in this test
    //it('Testing new_edits=false in req body', (done) => {
    //  var db = new PouchDB(dbs.name, noop);
    //  var docs = [{
    //      '_id': 'foo',
    //      '_rev': '2-x',
    //      '_revisions': {
    //        'start': 2,
    //        'ids': ['x', 'a']
    //      }
    //    }, {
    //      '_id': 'foo',
    //      '_rev': '2-y',
    //      '_revisions': {
    //        'start': 2,
    //        'ids': ['y', 'a']
    //      }
    //    }];
    //  db.bulkDocs({ docs: docs, new_edits: false }, (err, res) => {
    //    db.get('foo', { open_revs: 'all' }, (err, res) => {
    //    //  res.sort(function (a, b) {
    //    //    return a.ok._rev < b.ok._rev ? -1 :
    //    //      a.ok._rev > b.ok._rev ? 1 : 0;
    //    //  });
    //    //  res.length.should.equal(2);
    //    //  res[0].ok._rev.should.equal('2-x', 'doc1 ok');
    //    //  res[1].ok._rev.should.equal('2-y', 'doc2 ok');
    //      done();
    //    });
    //  });
    //});

    it('656 regression in handling deleted docs', (done) => {
      var db = new PouchDB(dbs.name, noop);
      db.bulkDocs({
        docs: [{
          _id: 'foo',
          _rev: '1-a',
          _deleted: true
        }]
      }, { new_edits: false }, (err, res) => {
          db.get('foo', (err, res) => {
            should.exist(err, 'deleted');
            //  todo: d.ts `get` error is a `BulkDocsError`
            //  todo: d.ts `BulkDocsError` error has similar shape to `ErrorDefinition`
            (<BulkDocsError>err).status.should.equal(PouchDB.Errors.MISSING_DOC.status,
              'correct error status returned');
            (<BulkDocsError>err).message.should.equal(PouchDB.Errors.MISSING_DOC.message,
              'correct error message returned');
            // todo: does not work in pouchdb-server.
            // err.reason.should.equal('deleted',
            //              'correct error reason returned');
            done();
          });
        });
    });

    it('Test quotes in doc ids', (done) => {
      var db = new PouchDB(dbs.name, noop);
      var docs = [{ _id: '\'your_sql_injection_script_here\'' }];
      db.bulkDocs({ docs: docs }, (err, res) => {
        should.not.exist(err, 'got error: ' + JSON.stringify(err));
        db.get('foo', (err, res) => {
          should.exist(err, 'deleted');
          done();
        });
      });
    });

    it('Bulk docs empty list', (done) => {
      var db = new PouchDB(dbs.name, noop);
      db.bulkDocs({ docs: [] }, (err, res) => {
        done(err);
      });
    });

    it('handles simultaneous writes', (done) => {
      var db1 = new PouchDB(dbs.name, noop);
      var db2 = new PouchDB(dbs.name, noop);
      var id = 'fooId';
      var errorNames = [];
      var ids = [];
      var numDone = 0;
      var callback: pouchdb.async.Callback<pouchdb.api.methods.bulkDocs.BulkDocsResponse[]> =
        (err, res) => {
          should.not.exist(err);
          if ((<BulkDocsError>res[0]).error) {
            errorNames.push((<BulkDocsError>res[0]).name);
          } else {
            ids.push(res[0].id);
          }
          if (++numDone === 2) {
            errorNames.should.deep.equal(['conflict']);
            ids.should.deep.equal([id]);
            done();
          }
        };
      db1.bulkDocs({ docs: [{ _id: id }] }, callback);
      db2.bulkDocs({ docs: [{ _id: id }] }, callback);
    });

    it('bulk docs input by array',(done) => {
      var db = new PouchDB(dbs.name, noop);
      var docs = makeDocs(5);
      db.bulkDocs(docs, (err, results) => {
        results.should.have.length(5, 'results length matches');
        for (var i = 0; i < 5; i++) {
          results[i].id.should.equal(docs[i]._id, 'id matches');
          should.exist(results[i].rev, 'rev is set');
          // Update the doc
          (<ExistingTestDoc>docs[i])._rev = results[i].rev;
          docs[i].string = docs[i].string + '.00';
        }
        db.bulkDocs(<ExistingTestDoc[]>docs, (err, results) => {
          results.should.have.length(5, 'results length matches');
          for (i = 0; i < 5; i++) {
            results[i].id.should.equal(i.toString(), 'id matches again');
            // set the delete flag to delete the docs in the next step
            (<ExistingTestDoc>docs[i])._rev = results[i].rev;
            (<ExistingTestDoc>docs[i])._deleted = true;
          }
          db.put(docs[0], (err, doc) => {
            db.bulkDocs(docs, (err, results) => {
              (<BulkDocsError>results[0]).name.should.equal(
                'conflict', 'First doc should be in conflict');
              should.not.exist(results[0].rev, 'no rev in conflict');
              for (i = 1; i < 5; i++) {
                results[i].id.should.equal(i.toString());
                should.exist(results[i].rev);
              }
              done();
            });
          });
        });
      });
    });

    it('Bulk empty list', (done) => {
      var db = new PouchDB(dbs.name, noop);
      db.bulkDocs([], (err, res) => {
        done(err);
      });
    });

    it('Bulk docs not an array', (done) => {
      var db = new PouchDB(dbs.name,noop);
      db.bulkDocs(<pouchdb.api.methods.bulkDocs.DocumentPouch<pouchdb.api.methods.NewDoc>><{}>{ docs: 'foo' },(err, res) => {
        should.exist(err, 'error reported');
        (<BulkDocsError>err).status.should.equal(PouchDB.Errors.MISSING_BULK_DOCS.status,
          'correct error status returned');
        (<BulkDocsError>err).message.should.equal(PouchDB.Errors.MISSING_BULK_DOCS.message,
          'correct error message returned');
        done();
      });
    });

    it('Bulk docs not an object', (done) => {
      var db = new PouchDB(dbs.name,noop);
      db.bulkDocs(<pouchdb.api.methods.bulkDocs.DocumentPouch<pouchdb.api.methods.NewDoc>><{}>{ docs: ['foo'] },(err, res) => {
        should.exist(err, 'error reported');
        (<BulkDocsError>err).status.should.equal(PouchDB.Errors.NOT_AN_OBJECT.status,
          'correct error status returned');
        (<BulkDocsError>err).message.should.equal(PouchDB.Errors.NOT_AN_OBJECT.message,
          'correct error message returned');
      });
      db.bulkDocs(<pouchdb.api.methods.bulkDocs.DocumentPouch<pouchdb.api.methods.NewDoc>><{}>{ docs: [[]] },(err, res) => {
        should.exist(err, 'error reported');
        (<BulkDocsError>err).status.should.equal(PouchDB.Errors.NOT_AN_OBJECT.status,
          'correct error status returned');
        (<BulkDocsError>err).message.should.equal(PouchDB.Errors.NOT_AN_OBJECT.message,
          'correct error message returned');
        done();
      });
    });

    //  todo: get returning an array
    //it('Bulk docs two different revisions to same document id', (done) => {
    //  var db = new PouchDB(dbs.name);
    //  var docid = "mydoc";

    //  function uuid() {
    //    return PouchDB.utils.uuid(32, 16).toLowerCase();
    //  }

    //  // create a few of rando, good revisions
    //  var numRevs = 3;
    //  var uuids = [];
    //  for (var i = 0; i < numRevs - 1; i++) {
    //    uuids.push(uuid());
    //  }

    //  // branch 1
    //  var a_conflict = uuid();
    //  var a_doc = {
    //    _id: docid,
    //    _rev: numRevs + '-' + a_conflict,
    //    //  todo: revisions array in d.ts
    //    _revisions: {
    //      start: numRevs,
    //      ids: [a_conflict].concat(uuids)
    //    }
    //  };

    //  // branch 2
    //  var b_conflict = uuid();
    //  var b_doc = {
    //    _id: docid,
    //    _rev: numRevs + '-' + b_conflict,
    //    _revisions: {
    //      start: numRevs,
    //      ids: [b_conflict].concat(uuids)
    //    }
    //  };

    //  // push the conflicted documents
    //  return db.bulkDocs([a_doc, b_doc], { new_edits: false })

    //    .then(function () {
    ////    return db.get(docid, { open_revs: "all" }).then(function (resp) {
    ////      resp.length.should.equal(2, 'correct number of open revisions');
    ////      resp[0].ok._id.should.equal(docid, 'rev 1, correct document id');
    ////      resp[1].ok._id.should.equal(docid, 'rev 2, correct document id');

    ////      // order of revisions is not specified
    ////      ((resp[0].ok._rev === a_doc._rev &&
    ////        resp[1].ok._rev === b_doc._rev) ||
    ////        (resp[0].ok._rev === b_doc._rev &&
    ////          resp[1].ok._rev === a_doc._rev)).should.equal(true);
    ////    });
    //  })

    //    .then(() => { done(); }, done);
    //});

  });
});
