/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  bytesToString, getInheritableProperty, isArrayBuffer, isBool, isEmptyObj,
  isNum, isSpace, isString, log2, ReadableStream, removeNullCharacters,
  stringToBytes, stringToPDFString
} from '../../src/shared/util';
import { Dict, Ref } from '../../src/core/primitives';
import { XRefMock } from './test_utils';

describe('util', function() {
  describe('bytesToString', function() {
    it('handles non-array arguments', function() {
      expect(function() {
        bytesToString(null);
      }).toThrow(new Error('Invalid argument for bytesToString'));
    });

    it('handles array arguments with a length not exceeding the maximum',
        function() {
      expect(bytesToString(new Uint8Array([]))).toEqual('');
      expect(bytesToString(new Uint8Array([102, 111, 111]))).toEqual('foo');
    });

    it('handles array arguments with a length exceeding the maximum',
        function() {
      const length = 10000; // Larger than MAX_ARGUMENT_COUNT = 8192.

      // Create an array with `length` 'a' character codes.
      let bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = 'a'.charCodeAt(0);
      }

      // Create a string with `length` 'a' characters. We need an array of size
      // `length + 1` since `join` puts the argument between the array elements.
      let string = Array(length + 1).join('a');

      expect(bytesToString(bytes)).toEqual(string);
    });
  });

  describe('getInheritableProperty', function() {
    it('handles non-dictionary arguments', function() {
      expect(getInheritableProperty({ dict: null, key: 'foo', }))
        .toEqual(undefined);
      expect(getInheritableProperty({ dict: undefined, key: 'foo', }))
        .toEqual(undefined);
    });

    it('handles dictionaries that do not contain the property', function() {
      // Empty dictionary.
      const emptyDict = new Dict();
      expect(getInheritableProperty({ dict: emptyDict, key: 'foo', }))
        .toEqual(undefined);

      // Filled dictionary with a different property.
      const filledDict = new Dict();
      filledDict.set('bar', 'baz');
      expect(getInheritableProperty({ dict: filledDict, key: 'foo', }))
        .toEqual(undefined);
    });

    it('fetches the property if it is not inherited', function() {
      const ref = new Ref(10, 0);
      const xref = new XRefMock([{ ref, data: 'quux', }]);
      const dict = new Dict(xref);

      // Regular values should be fetched.
      dict.set('foo', 'bar');
      expect(getInheritableProperty({ dict, key: 'foo', })).toEqual('bar');

      // Array value should be fetched (with references resolved).
      dict.set('baz', ['qux', ref]);
      expect(getInheritableProperty({ dict, key: 'baz', getArray: true, }))
        .toEqual(['qux', 'quux']);
    });

    it('fetches the property if it is inherited and present on one level',
        function() {
      const ref = new Ref(10, 0);
      const xref = new XRefMock([{ ref, data: 'quux', }]);
      const firstDict = new Dict(xref);
      const secondDict = new Dict(xref);
      firstDict.set('Parent', secondDict);

      // Regular values should be fetched.
      secondDict.set('foo', 'bar');
      expect(getInheritableProperty({ dict: firstDict, key: 'foo', }))
        .toEqual('bar');

      // Array value should be fetched (with references resolved).
      secondDict.set('baz', ['qux', ref]);
      expect(getInheritableProperty({ dict: firstDict, key: 'baz',
                                      getArray: true, }))
        .toEqual(['qux', 'quux']);
    });

    it('fetches the property if it is inherited and present on multiple levels',
        function() {
      const ref = new Ref(10, 0);
      const xref = new XRefMock([{ ref, data: 'quux', }]);
      const firstDict = new Dict(xref);
      const secondDict = new Dict(xref);
      firstDict.set('Parent', secondDict);

      // Regular values should be fetched.
      firstDict.set('foo', 'bar1');
      secondDict.set('foo', 'bar2');
      expect(getInheritableProperty({ dict: firstDict, key: 'foo', }))
        .toEqual('bar1');
      expect(getInheritableProperty({ dict: firstDict, key: 'foo',
                                      getArray: false, stopWhenFound: false, }))
        .toEqual(['bar1', 'bar2']);

      // Array value should be fetched (with references resolved).
      firstDict.set('baz', ['qux1', ref]);
      secondDict.set('baz', ['qux2', ref]);
      expect(getInheritableProperty({ dict: firstDict, key: 'baz',
                                      getArray: true, stopWhenFound: false, }))
        .toEqual([['qux1', 'quux'], ['qux2', 'quux']]);
    });

    it('stops searching when the loop limit is reached', function() {
      const dict = new Dict();
      let currentDict = dict;
      let parentDict = null;
      for (let i = 0; i < 150; i++) { // Exceeds the loop limit of 100.
        parentDict = new Dict();
        currentDict.set('Parent', parentDict);
        currentDict = parentDict;
      }
      parentDict.set('foo', 'bar'); // Never found because of loop limit.
      expect(getInheritableProperty({ dict, key: 'foo', })).toEqual(undefined);

      dict.set('foo', 'baz');
      expect(getInheritableProperty({ dict, key: 'foo', getArray: false,
                                      stopWhenFound: false, }))
        .toEqual(['baz']);
    });
  });

  describe('isArrayBuffer', function() {
    it('handles array buffer values', function() {
      expect(isArrayBuffer(new ArrayBuffer(0))).toEqual(true);
      expect(isArrayBuffer(new Uint8Array(0))).toEqual(true);
    });

    it('handles non-array buffer values', function() {
      expect(isArrayBuffer('true')).toEqual(false);
      expect(isArrayBuffer(1)).toEqual(false);
      expect(isArrayBuffer(null)).toEqual(false);
      expect(isArrayBuffer(undefined)).toEqual(false);
    });
  });

  describe('isBool', function() {
    it('handles boolean values', function() {
      expect(isBool(true)).toEqual(true);
      expect(isBool(false)).toEqual(true);
    });

    it('handles non-boolean values', function() {
      expect(isBool('true')).toEqual(false);
      expect(isBool('false')).toEqual(false);
      expect(isBool(1)).toEqual(false);
      expect(isBool(0)).toEqual(false);
      expect(isBool(null)).toEqual(false);
      expect(isBool(undefined)).toEqual(false);
    });
  });

  describe('isEmptyObj', function() {
    it('handles empty objects', function() {
      expect(isEmptyObj({})).toEqual(true);
    });

    it('handles non-empty objects', function() {
      expect(isEmptyObj({ foo: 'bar', })).toEqual(false);
    });
  });

  describe('isNum', function() {
    it('handles numeric values', function() {
      expect(isNum(1)).toEqual(true);
      expect(isNum(0)).toEqual(true);
      expect(isNum(-1)).toEqual(true);
      expect(isNum(1000000000000000000)).toEqual(true);
      expect(isNum(12.34)).toEqual(true);
    });

    it('handles non-numeric values', function() {
      expect(isNum('true')).toEqual(false);
      expect(isNum(true)).toEqual(false);
      expect(isNum(null)).toEqual(false);
      expect(isNum(undefined)).toEqual(false);
    });
  });

  describe('isSpace', function() {
    it('handles space characters', function() {
      expect(isSpace(0x20)).toEqual(true);
      expect(isSpace(0x09)).toEqual(true);
      expect(isSpace(0x0D)).toEqual(true);
      expect(isSpace(0x0A)).toEqual(true);
    });

    it('handles non-space characters', function() {
      expect(isSpace(0x0B)).toEqual(false);
      expect(isSpace(null)).toEqual(false);
      expect(isSpace(undefined)).toEqual(false);
    });
  });

  describe('isString', function() {
    it('handles string values', function() {
      expect(isString('foo')).toEqual(true);
      expect(isString('')).toEqual(true);
    });

    it('handles non-string values', function() {
      expect(isString(true)).toEqual(false);
      expect(isString(1)).toEqual(false);
      expect(isString(null)).toEqual(false);
      expect(isString(undefined)).toEqual(false);
    });
  });

  describe('log2', function() {
    it('handles values smaller than/equal to zero', function() {
      expect(log2(0)).toEqual(0);
      expect(log2(-1)).toEqual(0);
    });

    it('handles values larger than zero', function() {
      expect(log2(1)).toEqual(0);
      expect(log2(2)).toEqual(1);
      expect(log2(3)).toEqual(2);
      expect(log2(3.14)).toEqual(2);
    });
  });

  describe('stringToBytes', function() {
    it('handles non-string arguments', function() {
      expect(function() {
        stringToBytes(null);
      }).toThrow(new Error('Invalid argument for stringToBytes'));
    });

    it('handles string arguments', function() {
      expect(stringToBytes('')).toEqual(new Uint8Array([]));
      expect(stringToBytes('foo')).toEqual(new Uint8Array([102, 111, 111]));
    });
  });

  describe('stringToPDFString', function() {
    it('handles ISO Latin 1 strings', function() {
      let str = '\x8Dstring\x8E';
      expect(stringToPDFString(str)).toEqual('\u201Cstring\u201D');
    });

    it('handles UTF-16BE strings', function() {
      let str = '\xFE\xFF\x00\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67';
      expect(stringToPDFString(str)).toEqual('string');
    });

    it('handles empty strings', function() {
      // ISO Latin 1
      let str1 = '';
      expect(stringToPDFString(str1)).toEqual('');

      // UTF-16BE
      let str2 = '\xFE\xFF';
      expect(stringToPDFString(str2)).toEqual('');
    });
  });

  describe('removeNullCharacters', function() {
    it('should not modify string without null characters', function() {
      let str = 'string without null chars';
      expect(removeNullCharacters(str)).toEqual('string without null chars');
    });

    it('should modify string with null characters', function() {
      let str = 'string\x00With\x00Null\x00Chars';
      expect(removeNullCharacters(str)).toEqual('stringWithNullChars');
    });
  });

  describe('ReadableStream', function() {
    it('should return an Object', function () {
      let readable = new ReadableStream();
      expect(typeof readable).toEqual('object');
    });

    it('should have property getReader', function () {
      let readable = new ReadableStream();
      expect(typeof readable.getReader).toEqual('function');
    });
  });
});
