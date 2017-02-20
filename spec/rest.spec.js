"use strict";
// These tests check the "create" / "update" functionality of the REST API.
var auth = require('../src/Auth');
var Config = require('../src/Config');
var Parse = require('parse/node').Parse;
var rest = require('../src/rest');
var request = require('request');

var config = new Config('test');
const database = config.database;

describe('rest create', () => {

  beforeEach(() => {
    config = new Config('test');
  });

  it('handles _id', done => {
    rest.create(config, auth.nobody(config), 'Foo', {})
    .then(() => database.adapter.find('Foo', { fields: {} }, {}, {}))
    .then(results => {
      expect(results.length).toEqual(1);
      var obj = results[0];
      expect(typeof obj.objectId).toEqual('string');
      expect(obj._id).toBeUndefined();
      done();
    });
  });

  it('handles array, object, date', (done) => {
    const now = new Date();
    var obj = {
      array: [1, 2, 3],
      object: {foo: 'bar'},
      date: Parse._encode(now),
    };
    rest.create(config, auth.nobody(config), 'MyClass', obj)
    .then(() => database.adapter.find('MyClass', { fields: {
      array: { type: 'Array' },
      object: { type: 'Object' },
      date: { type: 'Date' },
    } }, {}, {}))
    .then(results => {
      expect(results.length).toEqual(1);
      var mob = results[0];
      expect(mob.array instanceof Array).toBe(true);
      expect(typeof mob.object).toBe('object');
      expect(mob.date.__type).toBe('Date');
      expect(new Date(mob.date.iso).getTime()).toBe(now.getTime());
      done();
    });
  });

  it('handles object and subdocument', done => {
    const obj = { subdoc: {foo: 'bar', wu: 'tan'} };
    rest.create(config, auth.nobody(config), 'MyClass', obj)
    .then(() => database.adapter.find('MyClass', { fields: {} }, {}, {}))
    .then(results => {
      expect(results.length).toEqual(1);
      const mob = results[0];
      expect(typeof mob.subdoc).toBe('object');
      expect(mob.subdoc.foo).toBe('bar');
      expect(mob.subdoc.wu).toBe('tan');
      expect(typeof mob.objectId).toEqual('string');
      const obj = { 'subdoc.wu': 'clan' };
      return rest.update(config, auth.nobody(config), 'MyClass', mob.objectId, obj)
    })
    .then(() => database.adapter.find('MyClass', { fields: {} }, {}, {}))
    .then(results => {
      expect(results.length).toEqual(1);
      const mob = results[0];
      expect(typeof mob.subdoc).toBe('object');
      expect(mob.subdoc.foo).toBe('bar');
      expect(mob.subdoc.wu).toBe('clan');
      done();
    })
    .catch(error => {
      console.log(error);
      fail();
      done();
    });
  });

  it('handles create on non-existent class when disabled client class creation', (done) => {
    var customConfig = Object.assign({}, config, {allowClientClassCreation: false});
    rest.create(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {})
      .then(() => {
        fail('Should throw an error');
        done();
      }, (err) => {
        expect(err.code).toEqual(Parse.Error.OPERATION_FORBIDDEN);
        expect(err.message).toEqual('This user is not allowed to access ' +
                                    'non-existent class: ClientClassCreation');
        done();
      });
  });

  it('handles create on existent class when disabled client class creation', (done) => {
    var customConfig = Object.assign({}, config, {allowClientClassCreation: false});
    config.database.loadSchema()
    .then(schema => schema.addClassIfNotExists('ClientClassCreation', {}))
    .then(actualSchema => {
      expect(actualSchema.className).toEqual('ClientClassCreation');
      return rest.create(customConfig, auth.nobody(customConfig), 'ClientClassCreation', {});
    })
    .then(() => {
      done();
    }, () => {
      fail('Should not throw error')
    });
  });

  it('handles user signup', (done) => {
    var user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    rest.create(config, auth.nobody(config), '_User', user)
      .then((r) => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        done();
      });
  });

  it('handles anonymous user signup', (done) => {
    var data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001'
        }
      }
    };
    var data2 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000002'
        }
      }
    };
    var username1;
    rest.create(config, auth.nobody(config), '_User', data1)
      .then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        return rest.create(config, auth.nobody(config), '_User', data1);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        username1 = r.response.username;
        return rest.create(config, auth.nobody(config), '_User', data2);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.create(config, auth.nobody(config), '_User', data2);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        expect(r.response.username).not.toEqual(username1);
        done();
      });
  });

  it('handles anonymous user signup and upgrade to new user', (done) => {
    var data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001'
        }
      }
    };

    var updatedData = {
      authData: { anonymous: null },
      username: 'hello',
      password: 'world'
    }
    var objectId;
    rest.create(config, auth.nobody(config), '_User', data1)
      .then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        objectId = r.response.objectId;
        return auth.getAuthForSessionToken({config, sessionToken: r.response.sessionToken })
      }).then((sessionAuth) => {
        return rest.update(config, sessionAuth, '_User', objectId, updatedData);
      }).then(() => {
        return Parse.User.logOut().then(() => {
          return Parse.User.logIn('hello', 'world');
        })
      }).then((r) => {
        expect(r.id).toEqual(objectId);
        expect(r.get('username')).toEqual('hello');
        done();
      }).catch((err) => {
        jfail(err);
        done();
      })
  });

  it('handles no anonymous users config', (done) => {
    var NoAnnonConfig = Object.assign({}, config);
    NoAnnonConfig.authDataManager.setEnableAnonymousUsers(false);
    var data1 = {
      authData: {
        anonymous: {
          id: '00000000-0000-0000-0000-000000000001'
        }
      }
    };
    rest.create(NoAnnonConfig, auth.nobody(NoAnnonConfig), '_User', data1).then(() => {
      fail("Should throw an error");
      done();
    }, (err) => {
      expect(err.code).toEqual(Parse.Error.UNSUPPORTED_SERVICE);
      expect(err.message).toEqual('This authentication method is unsupported.');
      NoAnnonConfig.authDataManager.setEnableAnonymousUsers(true);
      done();
    })
  });

  it('test facebook signup and login', (done) => {
    var data = {
      authData: {
        facebook: {
          id: '8675309',
          access_token: 'jenny'
        }
      }
    };
    var newUserSignedUpByFacebookObjectId;
    rest.create(config, auth.nobody(config), '_User', data)
      .then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        newUserSignedUpByFacebookObjectId = r.response.objectId;
        return rest.create(config, auth.nobody(config), '_User', data);
      }).then((r) => {
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.username).toEqual('string');
        expect(typeof r.response.updatedAt).toEqual('string');
        expect(r.response.objectId).toEqual(newUserSignedUpByFacebookObjectId);
        return rest.find(config, auth.master(config),
                          '_Session', {sessionToken: r.response.sessionToken});
      }).then((response) => {
        expect(response.results.length).toEqual(1);
        var output = response.results[0];
        expect(output.user.objectId).toEqual(newUserSignedUpByFacebookObjectId);
        done();
      }).catch(err => {
        jfail(err);
        done();
      })
  });

  it('stores pointers', done => {
    const obj = {
      foo: 'bar',
      aPointer: {
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty1234' // make it 10 chars to match PG storage
      }
    };
    rest.create(config, auth.nobody(config), 'APointerDarkly', obj)
    .then(() => database.adapter.find('APointerDarkly', { fields: {
      foo: { type: 'String' },
      aPointer: { type: 'Pointer', targetClass: 'JustThePointer' },
    }}, {}, {}))
    .then(results => {
      expect(results.length).toEqual(1);
      const output = results[0];
      expect(typeof output.foo).toEqual('string');
      expect(typeof output._p_aPointer).toEqual('undefined');
      expect(output._p_aPointer).toBeUndefined();
      expect(output.aPointer).toEqual({
        __type: 'Pointer',
        className: 'JustThePointer',
        objectId: 'qwerty1234'
      });
      done();
    });
  });

  it("cannot set objectId", (done) => {
    var headers = {
      'Content-Type': 'application/octet-stream',
      'X-Parse-Application-Id': 'test',
      'X-Parse-REST-API-Key': 'rest'
    };
    request.post({
      headers: headers,
      url: 'http://localhost:8378/1/classes/TestObject',
      body: JSON.stringify({
        'foo': 'bar',
        'objectId': 'hello'
      })
    }, (error, response, body) => {
      var b = JSON.parse(body);
      expect(b.code).toEqual(105);
      expect(b.error).toEqual('objectId is an invalid field name.');
      done();
    });
  });

  it("test default session length", (done) => {
    var user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    var now = new Date();

    rest.create(config, auth.nobody(config), '_User', user)
      .then((r) => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.find(config, auth.master(config),
                          '_Session', {sessionToken: r.response.sessionToken});
      })
      .then((r) => {
        expect(r.results.length).toEqual(1);

        var session = r.results[0];
        var actual = new Date(session.expiresAt.iso);
        var expected = new Date(now.getTime() + (1000 * 3600 * 24 * 365));

        expect(actual.getFullYear()).toEqual(expected.getFullYear());
        expect(actual.getMonth()).toEqual(expected.getMonth());
        expect(actual.getDate()).toEqual(expected.getDate());
        // less than a minute, if test happen at the wrong time :/
        expect(actual.getMinutes() - expected.getMinutes() <= 1).toBe(true);

        done();
      });
  });

  it("test specified session length", (done) => {
    var user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar',
    };
    var sessionLength = 3600, // 1 Hour ahead
      now = new Date(); // For reference later
    config.sessionLength = sessionLength;

    rest.create(config, auth.nobody(config), '_User', user)
      .then((r) => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.find(config, auth.master(config),
                          '_Session', {sessionToken: r.response.sessionToken});
      })
      .then((r) => {
        expect(r.results.length).toEqual(1);

        var session = r.results[0];
        var actual = new Date(session.expiresAt.iso);
        var expected = new Date(now.getTime() + (sessionLength * 1000));

        expect(actual.getFullYear()).toEqual(expected.getFullYear());
        expect(actual.getMonth()).toEqual(expected.getMonth());
        expect(actual.getDate()).toEqual(expected.getDate());
        expect(actual.getHours()).toEqual(expected.getHours());
        expect(actual.getMinutes()).toEqual(expected.getMinutes());

        done();
      }).catch(err => {
        jfail(err);
        done();
      });
  });

  it("can create a session with no expiration", (done) => {
    var user = {
      username: 'asdf',
      password: 'zxcv',
      foo: 'bar'
    };
    config.expireInactiveSessions = false;

    rest.create(config, auth.nobody(config), '_User', user)
      .then((r) => {
        expect(Object.keys(r.response).length).toEqual(3);
        expect(typeof r.response.objectId).toEqual('string');
        expect(typeof r.response.createdAt).toEqual('string');
        expect(typeof r.response.sessionToken).toEqual('string');
        return rest.find(config, auth.master(config),
          '_Session', {sessionToken: r.response.sessionToken});
      })
      .then((r) => {
        expect(r.results.length).toEqual(1);

        var session = r.results[0];
        expect(session.expiresAt).toBeUndefined();

        done();
      }).catch(err => {
        console.error(err);
        fail(err);
        done();
      })
  });
});

describe('rest update', () => {

  function createObjects(user, className, objects) {
    const createdObjects = [];
    return objects.reduce((promise, object) => {
      return promise.then(() => {
        return rest.create(config, user, className, object).then((created) => {
          createdObjects.push(created);
        })
      });
    }, Promise.resolve()).then(() => createdObjects);
  }

  it('rejects update on arbitrary criteria without master key', done => {
    const nobody = auth.nobody(config);
    const className = 'arbitrary';
    createObjects(nobody, className, [{ num: 1 }, { num: 2 }]).then(() => {
      return rest.update(config, nobody, className, null, {
        query: { num: 1 }
      });
    }).then(() => {
      done('Should not succeed');
    }, (err) => {
      console.log(err);
      done();
    });
  });

  it('does not update any objects when query param is omitted on class level update', done => {
    const master = auth.master(config);
    const className = 'arbitrary';
    createObjects(master, className, [{ num: 1 }, { num: 2 }]).then(() => {
      return rest.update(config, master, className, null, {
        update: { cool: true }
      });
    }).then(() => {
      return rest.find(config, master, className, { cool: true });
    }).then((results) => {
      if (results.length) {
        done('Mistakenly applied class level update');
      } else {
        done();
      }
    }, (err) => {
      done(err);
    });
  });

  it('can update using arbitrary criteria when using master key', done => {
    const master = auth.master(config);
    const className = 'arbitrary';
    createObjects(master, className, [{ num: 1 }, { num: 1 }, { num: 2 }]).then(() => {
      return rest.update(config, master, className, null, {
        query: { num: 1 },
        update: { cool: true }
      });
    }).then(() => {
      return rest.find(config, master, className, { cool: true });
    }).then((results) => {
      if (results.length === 1 && results[0].num === 1) {
        done();
      } else {
        done('Expected single matching item having update');
      }
    }, (err) => {
      done(err);
    });
  });

  it('can update many objects using arbitrary criteria', done => {
    const master = auth.master(config);
    const className = 'arbitrary';
    createObjects(master, className, [{ num: 1 }, { num: 2 }, { num: 2 }]).then(() => {
      return rest.update(config, master, className, null, {
        query: { num: 2 },
        update: { cool: true },
        many: true
      });
    }).then(() => {
      return rest.find(config, master, className, { cool: true });
    }).then((results) => {
      if (results.length === 2) {
        done();
      } else {
        done('Expected two matching items having update');
      }
    }, (err) => {
      done(err);
    });
  });

  it('can update many objects using atomic operations', done => {
    const master = auth.master(config);
    const className = 'arbitrary';
    createObjects(master, className, [{ num: 1 }, { num: 2 }, { num: 2 }]).then(() => {
      return rest.update(config, master, className, null, {
        query: { num: 2 },
        update: { num: { "__op": "Increment", "amount": 1 } },
        many: true
      });
    }).then(() => {
      return rest.find(config, master, className, { num: 3 });
    }).then((results) => {
      if (results.length === 2) {
        done();
      } else {
        done('Expected two matching items having update');
      }
    }, (err) => {
      done(err);
    });
  });

  it('ignores createdAt', done => {
    const nobody = auth.nobody(config);
    const className = 'Foo';
    const newCreatedAt = new Date('1970-01-01T00:00:00.000Z');

    rest.create(config, nobody, className, {}).then(res => {
      const objectId = res.response.objectId;
      const restObject = {
        createdAt: {__type: "Date", iso: newCreatedAt}, // should be ignored
      };

      return rest.update(config, nobody, className, objectId, restObject).then(() => {
        const restWhere = {
          objectId: objectId,
        };
        return rest.find(config, nobody, className, restWhere, {});
      });
    }).then(res2 => {
      const updatedObject = res2.results[0];
      expect(new Date(updatedObject.createdAt)).not.toEqual(newCreatedAt);
      done();
    }).then(done).catch(err => {
      fail(err);
      done();
    });
  });

});
