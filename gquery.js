(function() {

  var Lazy = this.Lazy;

  if (!Lazy) {
    if (typeof require === 'function') {
      Lazy = require('lazy.js');
    }

    if (!Lazy) {
      throw 'gQuery requires lazy.js!';
    }
  }

  /**
   * @typedef {object} LocatorPartOptions
   * @property {string} type One of ['id', 'class', 'name']
   * @property {boolean} direct Whether this part represents a direct descendant
   * @property {string} value The id, class name, or name to look for
   */

  /**
   * Wraps an object and provides jQuery-like query capabilities on that object.
   *
   * @example
   * var $ = gQuery([
   *   { 'id': 'foo', attr: 1 },
   *   { 'class': 'bar', attr: 2 },
   *   {
   *     'name': 'baz',
   *     'attr': 3,
   *     'children': [
   *       { 'class': 'bar', attr: 4 }
   *     ]
   *   }
   * ]);
   *
   * $('#foo');             // => collection: [{ id: 'foo', attr: 1 }]
   * $('.bar');             // => collection: [{ 'class': 'bar', attr: 2 }, { 'class': 'bar', attr: 4 }]
   * $('baz').prop('attr'); // => 3
   * $('baz > .bar');       // => collection: [{ 'class': 'bar', attr: 4 }]
   * $('.bar[attr="4"]');   // => collection: [{ 'class': 'bar', attr: 4 }]
   */
  function gQuery(context, options) {
    var adapter = new Adapter(context || [], options || {});

    return function $(selector) {
      return adapter.find(selector);
    };
  }

  /**
   * A collection of objects wrapped by gQuery.
   *
   * @param {Array.<*>} source The array of objects to include in the collection.
   * @param {Adapter} adapter The adapter to use for {@link #find}, etc.
   * @constructor
   */
  function Collection(source, adapter) {
    this.source  = source  || [];
    this.adapter = adapter || new Adapter();
    this.nodes   = this.createNodes();
  }

  Collection.prototype = new Lazy.ArrayLikeSequence();

  Collection.prototype.get = function get(i) {
    return this.nodes[i];
  };

  Collection.prototype.length = function length() {
    return this.source.length;
  };

  Collection.prototype.createNodes = function createNodes() {
    var collection = this,
        adapter = this.adapter;

    return Lazy(this.source)
      .map(function(object) {
        if (object instanceof Node) {
          return object;
        }

        return new Node(object, collection, adapter);
      })
      .toArray();
  };

  Collection.prototype.inspect = function inspect() {
    return JSON.stringify(this.value(), function(key, value) {
      if (key === 'parent' || key === 'adapter') {
        return undefined;
      }

      if (value instanceof Node) {
        return value.unwrap();
      }

      return value;
    }, 2);
  };

  /**
   * Either gets or sets the property with the specified name.
   *
   * To *get* the property, only supply the first parameter ('name'). The return
   * value will be retrieved from the first element in the collection.
   *
   * To *set* the property, supply both parameters ('name' and 'value'). The
   * property will be set for every element in the collection.
   *
   * @param {string} name The name of the property to get/set.
   * @param {*} value The value for the property.
   * @returns {Collection} The collection.
   *
   * @example
   * var collection = new gQuery.Collection([
   *   { tag: 1 },
   *   { tag: 2 }
   * ]);
   *
   * collection.prop('tag');    // => 1
   * collection.prop('tag', 3); // => collection: [{ tag: 3 }, { tag: 3 }]
   */
  Collection.prototype.prop = function prop(name, value) {
    if (arguments.length === 1) {
      var first = this.first();
      if (first) { return first.get(name); }
      return undefined;
    }

    this.each(function(e) {
      e.set(name, value);
    });

    return this;
  };

  /**
   * Finds all the matches for the given selector.
   *
   * @param {string} selector A selector like '#foo', '.bar', etc.
   * @returns {Collection} A collection consisting of all the matches.
   *
   * @example
   * var collection = new gQuery.Collection([
   *   {
   *     id: 'foo',
   *     children: [
   *       { 'class': 'bar', tag: 2 }
   *     ],
   *     tag: 1
   *   },
   *   { 'class': 'bar', tag: 3 }
   * ]);
   *
   * collection.find('#foo').prop('tag');  // => 1
   * collection.find('#foo').find('.bar'); // => collection: [{ 'class': 'bar', tag: 2 }]
   */
  Collection.prototype.find = function find(selector) {
    return new Locator(selector, this.adapter).find(this);
  };

  /**
   * A single object wrapped by gQuery. This guy has a reference to his parent,
   * which will be necessary for `appendTo`, `insertBefore`, etc.
   *
   * @param {*} object The object to wrap.
   * @param {?Node} parent The parent node (can be `null`).
   * @param {Adapter} adapter Always need the freakin' adapter.
   * @constructor
   */
  function Node(object, parent, adapter) {
    if (!(this instanceof Node)) {
      return new Node(object, parent, adapter);
    }

    this.object   = object;
    this.parent   = parent;
    this.adapter  = adapter;
    this.children = this.createChildren();
  }

  Object.defineProperty(Node.prototype, 'id', {
    get: function id() {
      return this.adapter.getId(this.object);
    }
  });

  Object.defineProperty(Node.prototype, 'name', {
    get: function name() {
      return this.adapter.getName(this.object);
    }
  });

  Object.defineProperty(Node.prototype, 'className', {
    get: function className() {
      return this.adapter.getClass(this.object);
    }
  });

  Node.prototype.get = function get(property) {
    return (this.object && this.object[property]) || undefined;
  };

  Node.prototype.set = function set(property, value) {
    var object = this.object;

    if (!object) {
      throw 'Cannot set a property of ' + object + '!';
    }

    var type = typeof object;
    if (type !== 'object' && type !== 'function') {
      throw 'Cannot set a property of a ' + type + '!';
    }

    object[property] = value;
    return this;
  };

  Node.prototype.createChildren = function createChildren() {
    var self = this,
        adapter = this.adapter;

    return Lazy(adapter.getChildren(this.object))
      .map(function(object) {
        return new Node(object, self, adapter);
      })
      .toArray();
  };

  Node.prototype.unwrap = function unwrap() {
    return this.object;
  };

  /**
   * The `Adapter` object is responsible for configuring how gQuery traverses a
   * data structure. In particular it provides these overridable methods:
   *
   * - `getId` (for `'#foo'`-style selectors)
   * - `getName` (for `'foo'`-style selectors)
   * - `getClass` (for `'.foo'`-style selectors)
   * - `getChildren` (to understand how to search the entire structure)
   *
   * @param {Object} context The object being wrapped.
   * @param {Object} options Optional overrides for the methods listed above.
   * @constructor
   */
  function Adapter(context, options) {
    this.context = context || [];

    options || (options = {});

    overrideMethod(this, 'getId', options.id);
    overrideMethod(this, 'getName', options.name);
    overrideMethod(this, 'getClass', options.class);
    overrideMethod(this, 'getChildren', options.children);
  }

  /**
   * @private
   * @param {Object} object
   * @param {string} name
   * @param {function(*):*|string} override
   *
   * @example
   * var base = { foo: 'bar' };
   *
   * overrideMethod(base, 'foo', function(x) { return -x; })
   *   .foo(5);
   * // => -5
   *
   * overrideMethod(base, 'foo', 'baz')
   *   .foo({ baz: 'blah' });
   * // => 'blah'
   */
  function overrideMethod(object, name, override) {
    if (typeof override === 'function') {
      object[name] = override;

    } else if (typeof override === 'string') {
      object[name] = function(node) {
        return node[override];
      };
    }

    return object;
  }

  Adapter.prototype.getId = function getId(node) {
    return node.id;
  };

  Adapter.prototype.getClass = function getClass(node) {
    return node.class;
  };

  Adapter.prototype.getName = function getName(node) {
    return node.name;
  };

  Adapter.prototype.getChildren = function getChildren(node) {
    return node.children || [];
  };

  Adapter.prototype.find = function find(selector) {
    return new Locator(selector, this).find(this.context);
  };

  Adapter.prototype.findMatches = function findMatches(nodes, recursive, predicate) {
    var adapter = this,
        matches = [];

    Lazy(nodes).each(function(node) {
      if (predicate(node)) {
        matches.push(node);
      }

      if (recursive) {
        matches.push.apply(matches, adapter.findMatches(node.children, true, predicate));
      }
    });

    return matches;
  };

  /**
   * The `Locator` object takes a selector and is responsible for applying that
   * selector in order to search a data structure.
   *
   * @param {string} selector A selector like '#foo', '.bar', etc.
   * @param {Adapter} adapter The adapter to use when searching.
   * @constructor
   */
  function Locator(selector, adapter) {
    this.adapter = adapter || new Adapter();

    this.parts = Lazy(parseSelector(selector || ''))
      .map(function(part) {
        return new LocatorPart(adapter, part);
      })
      .toArray();
  }

  /**
   * @example
   * var fooLocator   = new gQuery.Locator('#foo'),
   *     childLocator = new gQuery.Locator('foo > bar');
   *
   * fooLocator.find([{ id: 'bar' }, { id: 'foo' }]);
   * // => collection: [{ id: 'foo' }]
   *
   * fooLocator.find([
   *   { children: [] },
   *   { children: [{ id: 'bar' }] },
   *   {
   *     children: [
   *       { id: 'foo', attribute: 'blah' },
   *       { id: 'bar', attribute: 'whatever' }
   *     ]
   *   }
   * ]);
   * // => collection: [{ id: 'foo', attribute: 'blah' }]
   *
   * childLocator.find([
   *   {
   *     name: 'foo',
   *     children: [
   *       { name: 'foo', x: 1 },
   *       { name: 'bar', x: 2 },
   *       {
   *         children: [
   *           { name: 'bar', x: 3 }
   *         ]
   *       }
   *     ]
   *   },
   *   {
   *     name: 'bar',
   *     children: [
   *       { name: 'foo', x: 4 }
   *     ]
   *   }
   * ]);
   * // => collection: [{ name: 'bar', x: 2 }]
   */
  Locator.prototype.find = function find(target) {
    var adapter    = this.adapter,
        result     = getCollection(target, adapter),
        finalIndex = this.parts.length - 1;

    Lazy(this.parts).each(function(part, i) {
      result = adapter.findMatches(result, !part.direct, function(child) {
        return part.matches(child);
      });

      if (i != finalIndex) {
        result = Lazy(result)
          .map(function(match) {
            return match.children;
          })
          .flatten()
          .toArray();
      }
    });

    return new Collection(result, adapter);
  };

  /**
   * One part of a {@link Locator}.
   *
   * @param {Adapter} adapter
   * @param {LocatorPartOptions} options
   * @constructor
   */
  function LocatorPart(adapter, options) {
    options || (options = {});

    this.adapter   = adapter;
    this.source    = options.source;
    this.type      = options.type || 'name';
    this.direct    = options.direct || false;
    this.value     = options.value || '';
    this.condition = options.condition;
    this.matches   = this.getPredicate();
  }

  LocatorPart.prototype.getPredicate = function getPredicate() {
    var basePredicate = this.getBasePredicate(),
        predicate     = basePredicate,
        condition     = this.condition;

    if (condition) {
      predicate = this.applyCondition(condition, predicate);
    }

    return predicate;
  };

  LocatorPart.prototype.getBasePredicate = function getBasePredicate() {
    var adapter = this.adapter,
        type    = this.type,
        value   = this.value;

    switch (type) {
      case 'id':
        return function(node) {
          return node.id === value;
        };

      case 'class':
        return function(node) {
          return node.className === value;
        };

      case 'name':
        return function(node) {
          return node.name === value;
        };
    }
  };

  LocatorPart.prototype.applyCondition = function applyCondition(condition, predicate) {
    switch (condition.type) {
      case 'equality':
        return function(node) {
          if (!predicate(node)) { return false; }

          // TODO: allow for non-string (e.g. numeric) matching as well
          return String(node.get(condition.property)) === String(condition.value);
        };

      default:
        throw 'Unknown condition type: "' + condition.type + '"! ' +
          '(from selector: ' + this.source + ')';
    }
  };

  /**
   * @private
   * @param {string} selector
   * @returns {Array.<LocatorPart>}
   *
   * @example
   * parseSelector('foo > bar');
   * // => [
   *   { source: 'foo', type: 'name', direct: false, value: 'foo' },
   *   { source: 'bar', type: 'name', direct: true, value: 'bar' }
   * ]
   *
   * parseSelector('foo > > bar'); // throws
   *
   * parseSelector('#foo .bar baz');
   * // => [
   *   { source: '#foo', type: 'id', direct: false , value: 'foo' },
   *   { source: '.bar', type: 'class', direct: false, value: 'bar' },
   *   { source: 'baz', type: 'name', direct: false, value: 'baz' }
   * ]
   *
   * parseSelector('#foo[bar="baz"]');
   * // => [
   *   {
   *     source: '#foo[bar="baz"]',
   *     type: 'id',
   *     direct: false,
   *     value: 'foo',
   *     condition: {
   *       type: 'equality',
   *       property: 'bar',
   *       value: 'baz'
   *     }
   *   }
   * ]
   */
  function parseSelector(selector) {
    var matcher = /[#\.]?(?:[\w\d\-]+(?:\[[\w\d]+[=]".*"\])?|>)/g,
        match,
        value,
        parts = [],
        part,
        type,
        direct = false,
        conditionMatch;

    while (match = matcher.exec(selector)) {
      value = match[0];

      if (value === '>') {
        if (direct) {
          throw 'Encountered redundant "direct descendant" (>) selector at ' +
            match.index;
        }

        direct = true;
        continue;
      }

      switch (value.charAt(0)) {
        case '#':
          type = 'id';
          value = value.substring(1);
          break;

        case '.':
          type = 'class';
          value = value.substring(1);
          break;

        default:
          type = 'name';
          break;
      }

      partOptions = {
        source: match[0],
        type: type,
        direct: direct,
        value: value
      };

      conditionMatch = value.match(/\[([\w\d]+)[=]"(.*)"\]/);
      if (conditionMatch) {
        partOptions.value = partOptions.value
          .substring(0, conditionMatch.index);

        partOptions.condition = {
          type: 'equality',
          property: conditionMatch[1],
          value: conditionMatch[2]
        };
      }

      parts.push(partOptions);

      direct = false;
    }

    return parts;
  }

  function getCollection(source, adapter) {
    if (source instanceof Collection) {
      return source;
    }

    if (!(source instanceof Array)) {
      source = [source];
    }

    return new Collection(source, adapter);
  }

  gQuery.Adapter    = Adapter;
  gQuery.Collection = Collection;
  gQuery.Node       = Node;
  gQuery.Locator    = Locator;

  if (typeof module === 'object' && module && module.exports) {
    module.exports = gQuery;
  } else {
    this.gQuery = gQuery;
  }

}).call(this);
