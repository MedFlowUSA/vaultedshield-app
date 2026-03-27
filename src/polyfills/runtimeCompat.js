function defineIfMissing(target, key, descriptor) {
  if (!target || Object.prototype.hasOwnProperty.call(target, key)) {
    return;
  }

  Object.defineProperty(target, key, descriptor);
}

defineIfMissing(Array.prototype, "at", {
  value: function at(index) {
    const length = this.length >>> 0;
    if (length === 0) return undefined;
    const relativeIndex = Number(index) || 0;
    const normalizedIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
    if (normalizedIndex < 0 || normalizedIndex >= length) return undefined;
    return this[normalizedIndex];
  },
  writable: true,
  configurable: true,
});

defineIfMissing(Array.prototype, "flat", {
  value: function flat(depth = 1) {
    const normalizedDepth = Number(depth) || 0;
    const flatten = (input, currentDepth) =>
      input.reduce((accumulator, item) => {
        if (Array.isArray(item) && currentDepth > 0) {
          return accumulator.concat(flatten(item, currentDepth - 1));
        }
        accumulator.push(item);
        return accumulator;
      }, []);

    return flatten(Array.from(this), normalizedDepth);
  },
  writable: true,
  configurable: true,
});

defineIfMissing(Array.prototype, "flatMap", {
  value: function flatMap(callback, thisArg) {
    if (typeof callback !== "function") {
      throw new TypeError("Array.prototype.flatMap callback must be a function");
    }

    return Array.prototype.map.call(this, callback, thisArg).flat();
  },
  writable: true,
  configurable: true,
});

defineIfMissing(String.prototype, "replaceAll", {
  value: function replaceAll(searchValue, replaceValue) {
    if (searchValue instanceof RegExp) {
      if (!searchValue.global) {
        throw new TypeError("String.prototype.replaceAll requires a global RegExp");
      }
      return this.replace(searchValue, replaceValue);
    }

    return this.split(String(searchValue)).join(String(replaceValue));
  },
  writable: true,
  configurable: true,
});

defineIfMissing(Object, "fromEntries", {
  value: function fromEntries(entries) {
    if (!entries || typeof entries[Symbol.iterator] !== "function") {
      throw new TypeError("Object.fromEntries requires an iterable");
    }

    const result = {};
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2) {
        throw new TypeError("Iterator value " + entry + " is not an entry object");
      }
      result[entry[0]] = entry[1];
    }
    return result;
  },
  writable: true,
  configurable: true,
});
