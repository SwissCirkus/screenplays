import{a as e,i as t,n,o as r,r as i}from"./BinaryModule-DmMIV9F--D2J_LXCG.js";var a=Object.defineProperty,o=(e,t,n)=>t in e?a(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n,s=(e,t,n)=>o(e,typeof t==`symbol`?t:t+``,n),c=class{constructor(e){s(this,`binary`),s(this,`inner`),s(this,`disposed`,!1),this.binary=e.binary,this.binary.setup(),this.inner=this.createInner(e.dialect)}createInner(e){return t.from(async()=>(await this.binary.setup(),this.binary.createLinter(e)))}async setup(){await this.lint(``,{language:`plaintext`});let e=await this.exportIgnoredLints();await this.importIgnoredLints(e)}async lint(e,t){let n=await this.inner,r=i.Markdown;switch(t?.language){case`plaintext`:r=i.Plain;break;case`markdown`:r=i.Markdown;break;case`typst`:r=i.Typst}return n.lint(e,r,t?.forceAllHeadings??!1,t?.regex_mask)}async organizedLints(e,t){let n=await this.inner,r=i.Markdown;switch(t?.language){case`plaintext`:r=i.Plain;break;case`markdown`:r=i.Markdown;break;case`typst`:r=i.Typst;break}let a=n.organized_lints(e,r,t?.forceAllHeadings??!1,t?.regex_mask),o={};for(let e of a)o[e.group]=e.lints,e.free();return o}async applySuggestion(e,t,n){return(await this.inner).apply_suggestion(e,t,n)}async isLikelyEnglish(e){return(await this.inner).is_likely_english(e)}async isolateEnglish(e){return(await this.inner).isolate_english(e)}async getLintConfig(){return(await this.inner).get_lint_config_as_object()}async getDefaultLintConfigAsJSON(){return await this.binary.getDefaultLintConfigAsJSON()}async getDefaultLintConfig(){return await this.binary.getDefaultLintConfig()}async getStructuredLintConfig(){return(await this.inner).get_structured_lint_config_as_object()}async getStructuredLintConfigJSON(){return(await this.inner).get_structured_lint_config_as_json()}async setLintConfig(e){(await this.inner).set_lint_config_from_object(e)}async getLintConfigAsJSON(){return(await this.inner).get_lint_config_as_json()}async setLintConfigWithJSON(e){(await this.inner).set_lint_config_from_json(e)}async toTitleCase(e){return await this.binary.toTitleCase(e)}async getLintDescriptions(){return(await this.inner).get_lint_descriptions_as_object()}async getLintDescriptionsAsJSON(){return(await this.inner).get_lint_descriptions_as_json()}async getLintDescriptionsHTML(){return(await this.inner).get_lint_descriptions_html_as_object()}async getLintDescriptionsHTMLAsJSON(){return(await this.inner).get_lint_descriptions_html_as_json()}async ignoreLint(e,t){(await this.inner).ignore_lint(e,t)}async ignoreLintHash(e){(await this.inner).ignore_hash(e)}async exportIgnoredLints(){return(await this.inner).export_ignored_lints()}async importIgnoredLints(e){(await this.inner).import_ignored_lints(e)}async contextHash(e,t){return(await this.inner).context_hash(e,t)}async clearIgnoredLints(){(await this.inner).clear_ignored_lints()}async clearWords(){return(await this.inner).clear_words()}async importWords(e){return(await this.inner).import_words(e)}async exportWords(){return(await this.inner).export_words()}async getDialect(){return(await this.inner).get_dialect()}async setDialect(e){let t=await this.inner;return t.get_dialect()!==e&&(t.free(),this.inner=this.createInner(e)),Promise.resolve()}async summarizeStats(e,t){return(await this.inner).summarize_stats(e,t)}async generateStatsFile(){return(await this.inner).generate_stats_file()}async importStatsFile(e){return(await this.inner).import_stats_file(e)}async loadWeirpackFromBlob(e){let t=new Uint8Array(await e.arrayBuffer());return this.loadWeirpackFromBytes(t)}async loadWeirpackFromBytes(e){let t=await this.inner,n=e instanceof Uint8Array?e:Uint8Array.from(e);return t.import_weirpack(n)}async dispose(){this.disposed||(this.disposed=!0,(await this.inner).free())}};function l(e,t){if(!e)throw Error(`Assertion failed`)}var u=class{constructor(e){s(this,`binary`),this.binary=e,this.binary.setup()}async serializeArg(e){let{Lint:t,Span:n,Suggestion:r}=await this.binary.getBinaryModule();if(Array.isArray(e))return{json:JSON.stringify(await Promise.all(e.map(e=>this.serializeArg(e)))),type:`Array`};let i=typeof e;switch(i){case`string`:case`number`:case`boolean`:case`undefined`:return{json:JSON.stringify(e),type:i};case`bigint`:return{json:e.toString(),type:i}}if(e.to_json!==void 0){let i=e.to_json(),a;if(e instanceof t?a=`Lint`:e instanceof r?a=`Suggestion`:e instanceof n&&(a=`Span`),a===void 0)throw Error(`Unhandled case: type undefined`);return{json:i,type:a}}if(i==`object`)return{json:JSON.stringify(await Promise.all(Object.entries(e).map(([e,t])=>this.serializeArg([e,t])))),type:`object`};throw Error(`Unhandled case: ${e}`)}async serialize(e){return{procName:e.procName,args:await Promise.all(e.args.map(e=>this.serializeArg(e)))}}async deserializeArg(e){let{Lint:t,Span:n,Suggestion:r}=await this.binary.getBinaryModule();switch(e.type){case`bigint`:return BigInt(e.json);case`undefined`:return;case`boolean`:case`number`:case`string`:return JSON.parse(e.json);case`Suggestion`:return r.from_json(e.json);case`Lint`:return t.from_json(e.json);case`Span`:return n.from_json(e.json);case`Array`:{let t=JSON.parse(e.json);return l(Array.isArray(t)),await Promise.all(t.map(e=>this.deserializeArg(e)))}case`object`:{let t=JSON.parse(e.json);return Object.fromEntries(await Promise.all(t.map(e=>this.deserializeArg(e))))}default:throw Error(`Unhandled case: ${e.type}`)}}async deserialize(e){return{procName:e.procName,args:await Promise.all(e.args.map(e=>this.deserializeArg(e)))}}},d=`var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _executor, _promise;
let wasm;
function addToExternrefTable0(obj) {
  const idx = wasm.__externref_table_alloc();
  wasm.__wbindgen_externrefs.set(idx, obj);
  return idx;
}
function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(\`expected instance of \${klass.name}\`);
  }
}
function debugString(val) {
  const type = typeof val;
  if (type == "number" || type == "boolean" || val == null) {
    return \`\${val}\`;
  }
  if (type == "string") {
    return \`"\${val}"\`;
  }
  if (type == "symbol") {
    const description = val.description;
    if (description == null) {
      return "Symbol";
    } else {
      return \`Symbol(\${description})\`;
    }
  }
  if (type == "function") {
    const name = val.name;
    if (typeof name == "string" && name.length > 0) {
      return \`Function(\${name})\`;
    } else {
      return "Function";
    }
  }
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = "[";
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ", " + debugString(val[i]);
    }
    debug += "]";
    return debug;
  }
  const builtInMatches = /\\[object ([^\\]]+)\\]/.exec(toString.call(val));
  let className;
  if (builtInMatches && builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    return toString.call(val);
  }
  if (className == "Object") {
    try {
      return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
      return "Object";
    }
  }
  if (val instanceof Error) {
    return \`\${val.name}: \${val.message}
\${val.stack}\`;
  }
  return className;
}
function getArrayJsValueFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  const mem = getDataViewMemory0();
  const result = [];
  for (let i = ptr; i < ptr + 4 * len; i += 4) {
    result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
  }
  wasm.__externref_drop_slice(ptr, len);
  return result;
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    const idx = addToExternrefTable0(e);
    wasm.__wbindgen_exn_store(idx);
  }
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function passArrayJsValueToWasm0(array, malloc) {
  const ptr = malloc(array.length * 4, 4) >>> 0;
  for (let i = 0; i < array.length; i++) {
    const add = addToExternrefTable0(array[i]);
    getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
  }
  WASM_VECTOR_LEN = array.length;
  return ptr;
}
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8ArrayMemory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);
    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_externrefs.get(idx);
  wasm.__externref_table_dealloc(idx);
  return value;
}
let cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
const cachedTextEncoder = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length
    };
  };
}
let WASM_VECTOR_LEN = 0;
const LintFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_lint_free(ptr >>> 0, 1));
const LinterFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_linter_free(ptr >>> 0, 1));
const OrganizedGroupFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_organizedgroup_free(ptr >>> 0, 1));
const SpanFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_span_free(ptr >>> 0, 1));
const SuggestionFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((ptr) => wasm.__wbg_suggestion_free(ptr >>> 0, 1));
const Dialect = Object.freeze({
  American: 0,
  "0": "American",
  British: 1,
  "1": "British",
  Australian: 2,
  "2": "Australian",
  Canadian: 3,
  "3": "Canadian",
  Indian: 4,
  "4": "Indian"
});
const Language = Object.freeze({
  Plain: 0,
  "0": "Plain",
  Markdown: 1,
  "1": "Markdown",
  Typst: 2,
  "2": "Typst"
});
class Lint {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(Lint.prototype);
    obj.__wbg_ptr = ptr;
    LintFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  static __unwrap(jsValue) {
    if (!(jsValue instanceof Lint)) {
      return 0;
    }
    return jsValue.__destroy_into_raw();
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    LintFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_lint_free(ptr, 0);
  }
  /**
   * Get an array of any suggestions that may resolve the issue.
   * @returns {Suggestion[]}
   */
  suggestions() {
    const ret = wasm.lint_suggestions(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * Get a description of the error as HTML.
   * @returns {string}
   */
  message_html() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.lint_message_html(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Get the content of the source material pointed to by [\`Self::span\`]
   * @returns {string}
   */
  get_problem_text() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.lint_get_problem_text(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Get a string representing the general category of the lint.
   * @returns {string}
   */
  lint_kind_pretty() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.lint_lint_kind_pretty(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Equivalent to calling \`.length\` on the result of \`suggestions()\`.
   * @returns {number}
   */
  suggestion_count() {
    const ret = wasm.lint_suggestion_count(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Get the location of the problematic text.
   * @returns {Span}
   */
  span() {
    const ret = wasm.lint_span(this.__wbg_ptr);
    return Span.__wrap(ret);
  }
  /**
   * Get a description of the error.
   * @returns {string}
   */
  message() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.lint_message(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @returns {string}
   */
  to_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.lint_to_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} json
   * @returns {Lint}
   */
  static from_json(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lint_from_json(ptr0, len0);
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1]);
    }
    return Lint.__wrap(ret[0]);
  }
  /**
   * Get a string representing the general category of the lint.
   * @returns {string}
   */
  lint_kind() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.lint_lint_kind(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
}
if (Symbol.dispose) Lint.prototype[Symbol.dispose] = Lint.prototype.free;
class Linter {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(Linter.prototype);
    obj.__wbg_ptr = ptr;
    LinterFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    LinterFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_linter_free(ptr, 0);
  }
  /**
   * Clear the user dictionary.
   */
  clear_words() {
    wasm.linter_clear_words(this.__wbg_ptr);
  }
  /**
   * Get the dialect this struct was constructed for.
   * @returns {Dialect}
   */
  get_dialect() {
    const ret = wasm.linter_get_dialect(this.__wbg_ptr);
    return ret;
  }
  /**
   * Add a specific context hash to the ignored lints list.
   * @param {bigint} hash
   */
  ignore_hash(hash) {
    wasm.linter_ignore_hash(this.__wbg_ptr, hash);
  }
  /**
   * @param {string} source_text
   * @param {Lint} lint
   */
  ignore_lint(source_text, lint) {
    const ptr0 = passStringToWasm0(source_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(lint, Lint);
    var ptr1 = lint.__destroy_into_raw();
    wasm.linter_ignore_lint(this.__wbg_ptr, ptr0, len0, ptr1);
  }
  /**
   * Compute the context hash of a given lint.
   * @param {string} source_text
   * @param {Lint} lint
   * @returns {bigint}
   */
  context_hash(source_text, lint) {
    const ptr0 = passStringToWasm0(source_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(lint, Lint);
    const ret = wasm.linter_context_hash(this.__wbg_ptr, ptr0, len0, lint.__wbg_ptr);
    return BigInt.asUintN(64, ret);
  }
  /**
   * Export words from the dictionary.
   * Note: this will only return words previously added by [\`Self::import_words\`].
   * @returns {string[]}
   */
  export_words() {
    const ret = wasm.linter_export_words(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * Import words into the dictionary.
   * @param {string[]} additional_words
   */
  import_words(additional_words) {
    const ptr0 = passArrayJsValueToWasm0(additional_words, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.linter_import_words(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * Load a Weirpack from raw bytes, merging its rules into the current linter.
   * Returns test failures if any are found, and does not import in that case.
   * @param {Uint8Array} bytes
   * @returns {any}
   */
  import_weirpack(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.linter_import_weirpack(this.__wbg_ptr, ptr0, len0);
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
  }
  /**
   * Helper method to remove non-English text from a plain English document.
   * @param {string} text
   * @returns {string}
   */
  isolate_english(text) {
    let deferred2_0;
    let deferred2_1;
    try {
      const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.linter_isolate_english(this.__wbg_ptr, ptr0, len0);
      deferred2_0 = ret[0];
      deferred2_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
  }
  /**
   * @param {string} text
   * @param {Language} language
   * @param {boolean} all_headings
   * @param {string | null} [regex_mask]
   * @returns {OrganizedGroup[]}
   */
  organized_lints(text, language, all_headings, regex_mask) {
    const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(regex_mask) ? 0 : passStringToWasm0(regex_mask, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.linter_organized_lints(this.__wbg_ptr, ptr0, len0, language, all_headings, ptr1, len1);
    var v3 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
  }
  /**
   * @param {bigint | null} [start_time]
   * @param {bigint | null} [end_time]
   * @returns {any}
   */
  summarize_stats(start_time, end_time) {
    const ret = wasm.linter_summarize_stats(this.__wbg_ptr, !isLikeNone(start_time), isLikeNone(start_time) ? BigInt(0) : start_time, !isLikeNone(end_time), isLikeNone(end_time) ? BigInt(0) : end_time);
    return ret;
  }
  /**
   * Apply a suggestion from a given lint.
   * This action will be logged to the Linter's statistics.
   * @param {string} source_text
   * @param {Lint} lint
   * @param {Suggestion} suggestion
   * @returns {string}
   */
  apply_suggestion(source_text, lint, suggestion) {
    let deferred3_0;
    let deferred3_1;
    try {
      const ptr0 = passStringToWasm0(source_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      _assertClass(lint, Lint);
      _assertClass(suggestion, Suggestion);
      const ret = wasm.linter_apply_suggestion(this.__wbg_ptr, ptr0, len0, lint.__wbg_ptr, suggestion.__wbg_ptr);
      var ptr2 = ret[0];
      var len2 = ret[1];
      if (ret[3]) {
        ptr2 = 0;
        len2 = 0;
        throw takeFromExternrefTable0(ret[2]);
      }
      deferred3_0 = ptr2;
      deferred3_1 = len2;
      return getStringFromWasm0(ptr2, len2);
    } finally {
      wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
  }
  /**
   * @param {string} file
   */
  import_stats_file(file) {
    const ptr0 = passStringToWasm0(file, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.linter_import_stats_file(this.__wbg_ptr, ptr0, len0);
    if (ret[1]) {
      throw takeFromExternrefTable0(ret[0]);
    }
  }
  /**
   * Helper method to quickly check if a plain string is likely intended to be English
   * @param {string} text
   * @returns {boolean}
   */
  is_likely_english(text) {
    const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.linter_is_likely_english(this.__wbg_ptr, ptr0, len0);
    return ret !== 0;
  }
  clear_ignored_lints() {
    wasm.linter_clear_ignored_lints(this.__wbg_ptr);
  }
  /**
   * @returns {string}
   */
  generate_stats_file() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.linter_generate_stats_file(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Export the linter's ignored lints as a privacy-respecting JSON list of hashes.
   * @returns {string}
   */
  export_ignored_lints() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.linter_export_ignored_lints(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Import into the linter's ignored lints from a privacy-respecting JSON list of hashes.
   * @param {string} json
   */
  import_ignored_lints(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.linter_import_ignored_lints(this.__wbg_ptr, ptr0, len0);
    if (ret[1]) {
      throw takeFromExternrefTable0(ret[0]);
    }
  }
  /**
   * @returns {string}
   */
  get_lint_config_as_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.linter_get_lint_config_as_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @returns {any}
   */
  get_lint_config_as_object() {
    const ret = wasm.linter_get_lint_config_as_object(this.__wbg_ptr);
    return ret;
  }
  /**
   * @param {string} json
   */
  set_lint_config_from_json(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.linter_set_lint_config_from_json(this.__wbg_ptr, ptr0, len0);
    if (ret[1]) {
      throw takeFromExternrefTable0(ret[0]);
    }
  }
  /**
   * @param {any} object
   */
  set_lint_config_from_object(object) {
    const ret = wasm.linter_set_lint_config_from_object(this.__wbg_ptr, object);
    if (ret[1]) {
      throw takeFromExternrefTable0(ret[0]);
    }
  }
  /**
   * Get a JSON map containing the descriptions of all the linting rules, formatted as Markdown.
   * @returns {string}
   */
  get_lint_descriptions_as_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.linter_get_lint_descriptions_as_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Get a Record containing the descriptions of all the linting rules, formatted as Markdown.
   * @returns {any}
   */
  get_lint_descriptions_as_object() {
    const ret = wasm.linter_get_lint_descriptions_as_object(this.__wbg_ptr);
    return ret;
  }
  /**
   * Get a JSON map containing the descriptions of all the linting rules, formatted as HTML.
   * @returns {string}
   */
  get_lint_descriptions_html_as_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.linter_get_lint_descriptions_html_as_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @returns {string}
   */
  get_structured_lint_config_as_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.linter_get_structured_lint_config_as_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * Get a Record containing the descriptions of all the linting rules, formatted as HTML.
   * @returns {any}
   */
  get_lint_descriptions_html_as_object() {
    const ret = wasm.linter_get_lint_descriptions_html_as_object(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {any}
   */
  get_structured_lint_config_as_object() {
    const ret = wasm.linter_get_structured_lint_config_as_object(this.__wbg_ptr);
    return ret;
  }
  /**
   * Construct a new \`Linter\`.
   * Note that this can mean constructing the curated dictionary, which is the most expensive operation
   * in Harper.
   * @param {Dialect} dialect
   * @returns {Linter}
   */
  static new(dialect) {
    const ret = wasm.linter_new(dialect);
    return Linter.__wrap(ret);
  }
  /**
   * Perform the configured linting on the provided text.
   *
   * If the provided regex mask cannot be parsed, this method will return an empty array.
   * @param {string} text
   * @param {Language} language
   * @param {boolean} all_headings
   * @param {string | null} [regex_mask]
   * @returns {Lint[]}
   */
  lint(text, language, all_headings, regex_mask) {
    const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(regex_mask) ? 0 : passStringToWasm0(regex_mask, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.linter_lint(this.__wbg_ptr, ptr0, len0, language, all_headings, ptr1, len1);
    var v3 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
  }
}
if (Symbol.dispose) Linter.prototype[Symbol.dispose] = Linter.prototype.free;
class OrganizedGroup {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(OrganizedGroup.prototype);
    obj.__wbg_ptr = ptr;
    OrganizedGroupFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    OrganizedGroupFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_organizedgroup_free(ptr, 0);
  }
  /**
   * @returns {string}
   */
  get group() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.__wbg_get_organizedgroup_group(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} arg0
   */
  set group(arg0) {
    const ptr0 = passStringToWasm0(arg0, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_organizedgroup_group(this.__wbg_ptr, ptr0, len0);
  }
  /**
   * @returns {Lint[]}
   */
  get lints() {
    const ret = wasm.__wbg_get_organizedgroup_lints(this.__wbg_ptr);
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
  }
  /**
   * @param {Lint[]} arg0
   */
  set lints(arg0) {
    const ptr0 = passArrayJsValueToWasm0(arg0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.__wbg_set_organizedgroup_lints(this.__wbg_ptr, ptr0, len0);
  }
}
if (Symbol.dispose) OrganizedGroup.prototype[Symbol.dispose] = OrganizedGroup.prototype.free;
class Span {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(Span.prototype);
    obj.__wbg_ptr = ptr;
    SpanFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SpanFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_span_free(ptr, 0);
  }
  /**
   * @returns {number}
   */
  get start() {
    const ret = wasm.__wbg_get_span_start(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} arg0
   */
  set start(arg0) {
    wasm.__wbg_set_span_start(this.__wbg_ptr, arg0);
  }
  /**
   * @returns {number}
   */
  get end() {
    const ret = wasm.__wbg_get_span_end(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} arg0
   */
  set end(arg0) {
    wasm.__wbg_set_span_end(this.__wbg_ptr, arg0);
  }
  /**
   * @returns {number}
   */
  len() {
    const ret = wasm.span_len(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} start
   * @param {number} end
   * @returns {Span}
   */
  static new(start, end) {
    const ret = wasm.span_new(start, end);
    return Span.__wrap(ret);
  }
  /**
   * @returns {string}
   */
  to_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.span_to_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @returns {boolean}
   */
  is_empty() {
    const ret = wasm.span_is_empty(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * @param {string} json
   * @returns {Span}
   */
  static from_json(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.span_from_json(ptr0, len0);
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1]);
    }
    return Span.__wrap(ret[0]);
  }
}
if (Symbol.dispose) Span.prototype[Symbol.dispose] = Span.prototype.free;
class Suggestion {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(Suggestion.prototype);
    obj.__wbg_ptr = ptr;
    SuggestionFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    SuggestionFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_suggestion_free(ptr, 0);
  }
  /**
   * Get the text that is going to replace the problematic section.
   * If [\`Self::kind\`] is \`SuggestionKind::Remove\`, this will return an empty
   * string.
   * @returns {string}
   */
  get_replacement_text() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.suggestion_get_replacement_text(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @returns {SuggestionKind}
   */
  kind() {
    const ret = wasm.suggestion_kind(this.__wbg_ptr);
    return ret;
  }
  /**
   * @returns {string}
   */
  to_json() {
    let deferred1_0;
    let deferred1_1;
    try {
      const ret = wasm.suggestion_to_json(this.__wbg_ptr);
      deferred1_0 = ret[0];
      deferred1_1 = ret[1];
      return getStringFromWasm0(ret[0], ret[1]);
    } finally {
      wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
  }
  /**
   * @param {string} json
   * @returns {Suggestion}
   */
  static from_json(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.suggestion_from_json(ptr0, len0);
    if (ret[2]) {
      throw takeFromExternrefTable0(ret[1]);
    }
    return Suggestion.__wrap(ret[0]);
  }
}
if (Symbol.dispose) Suggestion.prototype[Symbol.dispose] = Suggestion.prototype.free;
const SuggestionKind = Object.freeze({
  /**
   * Replace the problematic text.
   */
  Replace: 0,
  "0": "Replace",
  /**
   * Remove the problematic text.
   */
  Remove: 1,
  "1": "Remove",
  /**
   * Insert additional text after the error.
   */
  InsertAfter: 2,
  "2": "InsertAfter"
});
function get_default_lint_config() {
  const ret = wasm.get_default_lint_config();
  return ret;
}
function get_default_lint_config_as_json() {
  let deferred1_0;
  let deferred1_1;
  try {
    const ret = wasm.get_default_lint_config_as_json();
    deferred1_0 = ret[0];
    deferred1_1 = ret[1];
    return getStringFromWasm0(ret[0], ret[1]);
  } finally {
    wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
  }
}
function setup() {
  wasm.setup();
}
function to_title_case(text) {
  let deferred2_0;
  let deferred2_1;
  try {
    const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.to_title_case(ptr0, len0);
    deferred2_0 = ret[0];
    deferred2_1 = ret[1];
    return getStringFromWasm0(ret[0], ret[1]);
  } finally {
    wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
  }
}
const EXPECTED_RESPONSE_TYPES = /* @__PURE__ */ new Set(["basic", "cors", "default"]);
async function __wbg_load(module, imports) {
  if (typeof Response === "function" && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === "function") {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);
        if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
          console.warn("\`WebAssembly.instantiateStreaming\` failed because your server does not serve Wasm with \`application/wasm\` MIME type. Falling back to \`WebAssembly.instantiate\` which is slower. Original error:\\n", e);
        } else {
          throw e;
        }
      }
    }
    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);
    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }
}
function __wbg_get_imports() {
  const imports = {};
  imports.wbg = {};
  imports.wbg.__wbg_Error_52673b7de5a0ca89 = function(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
  };
  imports.wbg.__wbg_String_8f0eb39a4a4c2f66 = function(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_boolean_get_dea25b33882b895b = function(arg0) {
    const v = arg0;
    const ret = typeof v === "boolean" ? v : void 0;
    return isLikeNone(ret) ? 16777215 : ret ? 1 : 0;
  };
  imports.wbg.__wbg___wbindgen_debug_string_adfb662ae34724b6 = function(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_is_function_8d400b8b1af978cd = function(arg0) {
    const ret = typeof arg0 === "function";
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_object_ce774f3490692386 = function(arg0) {
    const val = arg0;
    const ret = typeof val === "object" && val !== null;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_is_string_704ef9c8fc131030 = function(arg0) {
    const ret = typeof arg0 === "string";
    return ret;
  };
  imports.wbg.__wbg___wbindgen_jsval_loose_eq_766057600fdd1b0d = function(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
  };
  imports.wbg.__wbg___wbindgen_number_get_9619185a74197f95 = function(arg0, arg1) {
    const obj = arg1;
    const ret = typeof obj === "number" ? obj : void 0;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
  };
  imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
    const obj = arg1;
    const ret = typeof obj === "string" ? obj : void 0;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg_call_abb4ff46ce38be40 = function() {
    return handleError(function(arg0, arg1) {
      const ret = arg0.call(arg1);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_done_62ea16af4ce34b24 = function(arg0) {
    const ret = arg0.done;
    return ret;
  };
  imports.wbg.__wbg_entries_83c79938054e065f = function(arg0) {
    const ret = Object.entries(arg0);
    return ret;
  };
  imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
      deferred0_0 = arg0;
      deferred0_1 = arg1;
      console.error(getStringFromWasm0(arg0, arg1));
    } finally {
      wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
  };
  imports.wbg.__wbg_getRandomValues_1c61fac11405ffdc = function() {
    return handleError(function(arg0, arg1) {
      globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
    }, arguments);
  };
  imports.wbg.__wbg_getRandomValues_d50a9564033a7f85 = function() {
    return handleError(function(arg0, arg1) {
      globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
    }, arguments);
  };
  imports.wbg.__wbg_getTime_ad1e9878a735af08 = function(arg0) {
    const ret = arg0.getTime();
    return ret;
  };
  imports.wbg.__wbg_get_6b7bd52aca3f9671 = function(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
  };
  imports.wbg.__wbg_get_af9dab7e9603ea93 = function() {
    return handleError(function(arg0, arg1) {
      const ret = Reflect.get(arg0, arg1);
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_instanceof_ArrayBuffer_f3320d2419cd0355 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof ArrayBuffer;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_instanceof_Uint8Array_da54ccc9d3e09434 = function(arg0) {
    let result;
    try {
      result = arg0 instanceof Uint8Array;
    } catch (_) {
      result = false;
    }
    const ret = result;
    return ret;
  };
  imports.wbg.__wbg_iterator_27b7c8b35ab3e86b = function() {
    const ret = Symbol.iterator;
    return ret;
  };
  imports.wbg.__wbg_length_22ac23eaec9d8053 = function(arg0) {
    const ret = arg0.length;
    return ret;
  };
  imports.wbg.__wbg_length_d45040a40c570362 = function(arg0) {
    const ret = arg0.length;
    return ret;
  };
  imports.wbg.__wbg_lint_new = function(arg0) {
    const ret = Lint.__wrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_lint_unwrap = function(arg0) {
    const ret = Lint.__unwrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_log_0cc1b7768397bcfe = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
    let deferred0_0;
    let deferred0_1;
    try {
      deferred0_0 = arg0;
      deferred0_1 = arg1;
      console.log(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
    } finally {
      wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
  };
  imports.wbg.__wbg_log_cb9e190acc5753fb = function(arg0, arg1) {
    let deferred0_0;
    let deferred0_1;
    try {
      deferred0_0 = arg0;
      deferred0_1 = arg1;
      console.log(getStringFromWasm0(arg0, arg1));
    } finally {
      wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
    }
  };
  imports.wbg.__wbg_mark_7438147ce31e9d4b = function(arg0, arg1) {
    performance.mark(getStringFromWasm0(arg0, arg1));
  };
  imports.wbg.__wbg_measure_fb7825c11612c823 = function() {
    return handleError(function(arg0, arg1, arg2, arg3) {
      let deferred0_0;
      let deferred0_1;
      let deferred1_0;
      let deferred1_1;
      try {
        deferred0_0 = arg0;
        deferred0_1 = arg1;
        deferred1_0 = arg2;
        deferred1_1 = arg3;
        performance.measure(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
      } finally {
        wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
      }
    }, arguments);
  };
  imports.wbg.__wbg_new_0_23cedd11d9b40c9d = function() {
    const ret = /* @__PURE__ */ new Date();
    return ret;
  };
  imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
    const ret = new Object();
    return ret;
  };
  imports.wbg.__wbg_new_25f239778d6112b9 = function() {
    const ret = new Array();
    return ret;
  };
  imports.wbg.__wbg_new_6421f6084cc5bc5a = function(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
  };
  imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
    const ret = new Error();
    return ret;
  };
  imports.wbg.__wbg_new_b546ae120718850e = function() {
    const ret = /* @__PURE__ */ new Map();
    return ret;
  };
  imports.wbg.__wbg_next_138a17bbf04e926c = function(arg0) {
    const ret = arg0.next;
    return ret;
  };
  imports.wbg.__wbg_next_3cfe5c0fe2a4cc53 = function() {
    return handleError(function(arg0) {
      const ret = arg0.next();
      return ret;
    }, arguments);
  };
  imports.wbg.__wbg_organizedgroup_new = function(arg0) {
    const ret = OrganizedGroup.__wrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_prototypesetcall_dfe9b766cdc1f1fd = function(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
  };
  imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
    arg0[arg1] = arg2;
  };
  imports.wbg.__wbg_set_7df433eea03a5c14 = function(arg0, arg1, arg2) {
    arg0[arg1 >>> 0] = arg2;
  };
  imports.wbg.__wbg_set_efaaf145b9377369 = function(arg0, arg1, arg2) {
    const ret = arg0.set(arg1, arg2);
    return ret;
  };
  imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
    const ret = arg1.stack;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
  };
  imports.wbg.__wbg_suggestion_new = function(arg0) {
    const ret = Suggestion.__wrap(arg0);
    return ret;
  };
  imports.wbg.__wbg_value_57b7b035e117f7ee = function(arg0) {
    const ret = arg0.value;
    return ret;
  };
  imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
  };
  imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
    const ret = arg0;
    return ret;
  };
  imports.wbg.__wbindgen_init_externref_table = function() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, void 0);
    table.set(offset + 0, void 0);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
  };
  return imports;
}
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  __wbg_init.__wbindgen_wasm_module = module;
  cachedDataViewMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  wasm.__wbindgen_start();
  return wasm;
}
function initSync(module) {
  if (wasm !== void 0) return wasm;
  if (typeof module !== "undefined") {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn("using deprecated parameters for \`initSync()\`; pass a single object instead");
    }
  }
  const imports = __wbg_get_imports();
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init(instance, module);
}
async function __wbg_init(module_or_path) {
  if (wasm !== void 0) return wasm;
  if (typeof module_or_path !== "undefined") {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn("using deprecated parameters for the initialization function; pass a single object instead");
    }
  }
  if (typeof module_or_path === "undefined") {
    module_or_path = new URL();
  }
  const imports = __wbg_get_imports();
  if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
    module_or_path = fetch(module_or_path);
  }
  const { instance, module } = await __wbg_load(await module_or_path, imports);
  return __wbg_finalize_init(instance, module);
}
var harper_wasm_slim = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  Dialect,
  Language,
  Lint,
  Linter,
  OrganizedGroup,
  Span,
  Suggestion,
  SuggestionKind,
  default: __wbg_init,
  get_default_lint_config,
  get_default_lint_config_as_json,
  initSync,
  setup,
  to_title_case
});
const _PLazy = class _PLazy extends Promise {
  constructor(executor) {
    super((resolve) => {
      resolve();
    });
    __privateAdd(this, _executor);
    __privateAdd(this, _promise);
    __privateSet(this, _executor, executor);
  }
  static from(function_) {
    return new _PLazy((resolve) => {
      resolve(function_());
    });
  }
  static resolve(value) {
    return new _PLazy((resolve) => {
      resolve(value);
    });
  }
  static reject(error) {
    return new _PLazy((resolve, reject) => {
      reject(error);
    });
  }
  then(onFulfilled, onRejected) {
    __privateGet(this, _promise) ?? __privateSet(this, _promise, new Promise(__privateGet(this, _executor)));
    return __privateGet(this, _promise).then(onFulfilled, onRejected);
  }
  catch(onRejected) {
    __privateGet(this, _promise) ?? __privateSet(this, _promise, new Promise(__privateGet(this, _executor)));
    return __privateGet(this, _promise).catch(onRejected);
  }
  finally(onFinally) {
    __privateGet(this, _promise) ?? __privateSet(this, _promise, new Promise(__privateGet(this, _executor)));
    return __privateGet(this, _promise).finally(onFinally);
  }
};
_executor = new WeakMap();
_promise = new WeakMap();
let PLazy = _PLazy;
const copyProperty = (to, from, property, ignoreNonConfigurable) => {
  if (property === "length" || property === "prototype") {
    return;
  }
  if (property === "arguments" || property === "caller") {
    return;
  }
  const toDescriptor = Object.getOwnPropertyDescriptor(to, property);
  const fromDescriptor = Object.getOwnPropertyDescriptor(from, property);
  if (!canCopyProperty(toDescriptor, fromDescriptor) && ignoreNonConfigurable) {
    return;
  }
  Object.defineProperty(to, property, fromDescriptor);
};
const canCopyProperty = function(toDescriptor, fromDescriptor) {
  return toDescriptor === void 0 || toDescriptor.configurable || toDescriptor.writable === fromDescriptor.writable && toDescriptor.enumerable === fromDescriptor.enumerable && toDescriptor.configurable === fromDescriptor.configurable && (toDescriptor.writable || toDescriptor.value === fromDescriptor.value);
};
const changePrototype = (to, from) => {
  const fromPrototype = Object.getPrototypeOf(from);
  if (fromPrototype === Object.getPrototypeOf(to)) {
    return;
  }
  Object.setPrototypeOf(to, fromPrototype);
};
const wrappedToString = (withName, fromBody) => \`/* Wrapped \${withName}*/
\${fromBody}\`;
const toStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, "toString");
const toStringName = Object.getOwnPropertyDescriptor(Function.prototype.toString, "name");
const changeToString = (to, from, name) => {
  const withName = name === "" ? "" : \`with \${name.trim()}() \`;
  const newToString = wrappedToString.bind(null, withName, from.toString());
  Object.defineProperty(newToString, "name", toStringName);
  Object.defineProperty(to, "toString", { ...toStringDescriptor, value: newToString });
};
function mimicFunction(to, from, { ignoreNonConfigurable = false } = {}) {
  const { name } = to;
  for (const property of Reflect.ownKeys(from)) {
    copyProperty(to, from, property, ignoreNonConfigurable);
  }
  changePrototype(to, from);
  changeToString(to, from, name);
  return to;
}
const cacheStore = /* @__PURE__ */ new WeakMap();
function pMemoize(fn, { cacheKey = ([firstArgument]) => firstArgument, cache = /* @__PURE__ */ new Map() } = {}) {
  const promiseCache = /* @__PURE__ */ new Map();
  const memoized = function(...arguments_) {
    const key = cacheKey(arguments_);
    if (promiseCache.has(key)) {
      return promiseCache.get(key);
    }
    const promise = (async () => {
      try {
        if (cache && await cache.has(key)) {
          return await cache.get(key);
        }
        const promise2 = fn.apply(this, arguments_);
        const result = await promise2;
        try {
          return result;
        } finally {
          if (cache) {
            await cache.set(key, result);
          }
        }
      } finally {
        promiseCache.delete(key);
      }
    })();
    promiseCache.set(key, promise);
    return promise;
  };
  mimicFunction(memoized, fn, {
    ignoreNonConfigurable: true
  });
  cacheStore.set(memoized, cache);
  return memoized;
}
const loadBinary = pMemoize(async (binary) => {
  const exports = await Promise.resolve().then(function() {
    return harper_wasm_slim;
  });
  let input;
  if (typeof process !== "undefined" && binary.startsWith("file://")) {
    const fs = await Promise.resolve().then(function() {
      return __viteBrowserExternal$1;
    });
    input = new Promise((resolve, reject) => {
      fs.readFile(new URL(binary).pathname, (err, data) => {
        if (err) reject(err);
        resolve(data);
      });
    });
  } else {
    input = binary;
  }
  await exports.default({ module_or_path: input });
  return exports;
});
class BinaryModuleImpl {
  constructor() {
    __publicField(this, "url", "");
    __publicField(this, "inner", null);
  }
  /** Load a binary from a specified URL. This is the only recommended way to construct this type. */
  static create(url) {
    const module = new SuperBinaryModule();
    module.url = url;
    module.inner = PLazy.from(
      () => loadBinary(typeof module.url === "string" ? module.url : module.url.href)
    );
    return module;
  }
  async getDefaultLintConfigAsJSON() {
    const exported = await this.inner;
    return exported.get_default_lint_config_as_json();
  }
  async getDefaultLintConfig() {
    const exported = await this.inner;
    return exported.get_default_lint_config();
  }
  async toTitleCase(text) {
    const exported = await this.inner;
    return exported.to_title_case(text);
  }
  async setup() {
    const exported = await this.inner;
    exported.setup();
  }
}
class SuperBinaryModule extends BinaryModuleImpl {
  async createLinter(dialect) {
    const exported = await this.getBinaryModule();
    return exported.Linter.new(dialect ?? Dialect.American);
  }
  async getBinaryModule() {
    return await PLazy.from(
      () => loadBinary(typeof this.url === "string" ? this.url : this.url.href)
    );
  }
}
class LocalLinter {
  constructor(init) {
    __publicField(this, "binary");
    __publicField(this, "inner");
    __publicField(this, "disposed", false);
    this.binary = init.binary;
    this.binary.setup();
    this.inner = this.createInner(init.dialect);
  }
  createInner(dialect) {
    return PLazy.from(async () => {
      await this.binary.setup();
      return this.binary.createLinter(dialect);
    });
  }
  async setup() {
    await this.lint("", { language: "plaintext" });
    const exported = await this.exportIgnoredLints();
    await this.importIgnoredLints(exported);
  }
  async lint(text, options) {
    const inner = await this.inner;
    let language = Language.Markdown;
    switch (options == null ? void 0 : options.language) {
      case "plaintext":
        language = Language.Plain;
        break;
      case "markdown":
        language = Language.Markdown;
        break;
      case "typst":
        language = Language.Typst;
    }
    const lints = inner.lint(
      text,
      language,
      (options == null ? void 0 : options.forceAllHeadings) ?? false,
      options == null ? void 0 : options.regex_mask
    );
    return lints;
  }
  async organizedLints(text, options) {
    const inner = await this.inner;
    let language = Language.Markdown;
    switch (options == null ? void 0 : options.language) {
      case "plaintext":
        language = Language.Plain;
        break;
      case "markdown":
        language = Language.Markdown;
        break;
      case "typst":
        language = Language.Typst;
        break;
    }
    const lintGroups = inner.organized_lints(
      text,
      language,
      (options == null ? void 0 : options.forceAllHeadings) ?? false,
      options == null ? void 0 : options.regex_mask
    );
    const output = {};
    for (const group of lintGroups) {
      output[group.group] = group.lints;
      group.free();
    }
    return output;
  }
  async applySuggestion(text, lint, suggestion) {
    const inner = await this.inner;
    return inner.apply_suggestion(text, lint, suggestion);
  }
  async isLikelyEnglish(text) {
    const inner = await this.inner;
    return inner.is_likely_english(text);
  }
  async isolateEnglish(text) {
    const inner = await this.inner;
    return inner.isolate_english(text);
  }
  async getLintConfig() {
    const inner = await this.inner;
    return inner.get_lint_config_as_object();
  }
  async getDefaultLintConfigAsJSON() {
    return await this.binary.getDefaultLintConfigAsJSON();
  }
  async getDefaultLintConfig() {
    return await this.binary.getDefaultLintConfig();
  }
  async getStructuredLintConfig() {
    const inner = await this.inner;
    return inner.get_structured_lint_config_as_object();
  }
  async getStructuredLintConfigJSON() {
    const inner = await this.inner;
    return inner.get_structured_lint_config_as_json();
  }
  async setLintConfig(config) {
    const inner = await this.inner;
    inner.set_lint_config_from_object(config);
  }
  async getLintConfigAsJSON() {
    const inner = await this.inner;
    return inner.get_lint_config_as_json();
  }
  async setLintConfigWithJSON(config) {
    const inner = await this.inner;
    inner.set_lint_config_from_json(config);
  }
  async toTitleCase(text) {
    return await this.binary.toTitleCase(text);
  }
  async getLintDescriptions() {
    const inner = await this.inner;
    return inner.get_lint_descriptions_as_object();
  }
  async getLintDescriptionsAsJSON() {
    const inner = await this.inner;
    return inner.get_lint_descriptions_as_json();
  }
  async getLintDescriptionsHTML() {
    const inner = await this.inner;
    return inner.get_lint_descriptions_html_as_object();
  }
  async getLintDescriptionsHTMLAsJSON() {
    const inner = await this.inner;
    return inner.get_lint_descriptions_html_as_json();
  }
  async ignoreLint(source, lint) {
    const inner = await this.inner;
    inner.ignore_lint(source, lint);
  }
  async ignoreLintHash(hash) {
    const inner = await this.inner;
    inner.ignore_hash(hash);
  }
  async exportIgnoredLints() {
    const inner = await this.inner;
    return inner.export_ignored_lints();
  }
  async importIgnoredLints(json) {
    const inner = await this.inner;
    inner.import_ignored_lints(json);
  }
  async contextHash(source, lint) {
    const inner = await this.inner;
    return inner.context_hash(source, lint);
  }
  async clearIgnoredLints() {
    const inner = await this.inner;
    inner.clear_ignored_lints();
  }
  async clearWords() {
    const inner = await this.inner;
    return inner.clear_words();
  }
  async importWords(words) {
    const inner = await this.inner;
    return inner.import_words(words);
  }
  async exportWords() {
    const inner = await this.inner;
    return inner.export_words();
  }
  async getDialect() {
    const inner = await this.inner;
    return inner.get_dialect();
  }
  async setDialect(dialect) {
    const inner = await this.inner;
    if (inner.get_dialect() !== dialect) {
      inner.free();
      this.inner = this.createInner(dialect);
    }
    return Promise.resolve();
  }
  async summarizeStats(start, end) {
    const inner = await this.inner;
    return inner.summarize_stats(start, end);
  }
  async generateStatsFile() {
    const inner = await this.inner;
    return inner.generate_stats_file();
  }
  async importStatsFile(statsFile) {
    const inner = await this.inner;
    return inner.import_stats_file(statsFile);
  }
  /**
   * Load a Weirpack from a Blob.
   *
   * Returns \`undefined\` if tests pass and rules are imported, otherwise returns
   * the Weirpack test failures.
   */
  async loadWeirpackFromBlob(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return this.loadWeirpackFromBytes(bytes);
  }
  /**
   * Load a Weirpack from a byte array.
   *
   * Returns \`undefined\` if tests pass and rules are imported, otherwise returns
   * the Weirpack test failures.
   */
  async loadWeirpackFromBytes(bytes) {
    const inner = await this.inner;
    const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    const result = inner.import_weirpack(data);
    return result;
  }
  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const inner = await this.inner;
    inner.free();
  }
}
function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed");
  }
}
function isSerializedRequest(v) {
  return typeof v === "object" && v !== null && "procName" in v && "args" in v;
}
class Serializer {
  constructor(binary) {
    __publicField(this, "binary");
    this.binary = binary;
    this.binary.setup();
  }
  async serializeArg(arg) {
    const { Lint: Lint2, Span: Span2, Suggestion: Suggestion2 } = await this.binary.getBinaryModule();
    if (Array.isArray(arg)) {
      return {
        json: JSON.stringify(await Promise.all(arg.map((a) => this.serializeArg(a)))),
        type: "Array"
      };
    }
    const argType = typeof arg;
    switch (argType) {
      case "string":
      case "number":
      case "boolean":
      case "undefined":
        return { json: JSON.stringify(arg), type: argType };
      case "bigint":
        return { json: arg.toString(), type: argType };
    }
    if (arg.to_json !== void 0) {
      const json = arg.to_json();
      let type;
      if (arg instanceof Lint2) {
        type = "Lint";
      } else if (arg instanceof Suggestion2) {
        type = "Suggestion";
      } else if (arg instanceof Span2) {
        type = "Span";
      }
      if (type === void 0) {
        throw new Error("Unhandled case: type undefined");
      }
      return { json, type };
    }
    if (argType == "object") {
      return {
        json: JSON.stringify(
          await Promise.all(
            Object.entries(arg).map(([key, value]) => this.serializeArg([key, value]))
          )
        ),
        type: "object"
      };
    }
    throw new Error(\`Unhandled case: \${arg}\`);
  }
  async serialize(req) {
    return {
      procName: req.procName,
      args: await Promise.all(req.args.map((arg) => this.serializeArg(arg)))
    };
  }
  async deserializeArg(requestArg) {
    const { Lint: Lint2, Span: Span2, Suggestion: Suggestion2 } = await this.binary.getBinaryModule();
    switch (requestArg.type) {
      case "bigint":
        return BigInt(requestArg.json);
      case "undefined":
        return void 0;
      case "boolean":
      case "number":
      case "string":
        return JSON.parse(requestArg.json);
      case "Suggestion":
        return Suggestion2.from_json(requestArg.json);
      case "Lint":
        return Lint2.from_json(requestArg.json);
      case "Span":
        return Span2.from_json(requestArg.json);
      case "Array": {
        const parsed = JSON.parse(requestArg.json);
        assert(Array.isArray(parsed));
        return await Promise.all(parsed.map((arg) => this.deserializeArg(arg)));
      }
      case "object": {
        const parsed = JSON.parse(requestArg.json);
        return Object.fromEntries(
          await Promise.all(parsed.map((val) => this.deserializeArg(val)))
        );
      }
      default:
        throw new Error(\`Unhandled case: \${requestArg.type}\`);
    }
  }
  async deserialize(request) {
    return {
      procName: request.procName,
      args: await Promise.all(request.args.map((arg) => this.deserializeArg(arg)))
    };
  }
}
self.postMessage("ready");
self.onmessage = (e) => {
  const [binaryUrl, dialect] = e.data;
  if (typeof binaryUrl !== "string") {
    throw new TypeError(\`Expected binary to be a string of url but got \${typeof binaryUrl}.\`);
  }
  const binary = SuperBinaryModule.create(binaryUrl);
  const serializer = new Serializer(binary);
  const linter = new LocalLinter({ binary, dialect });
  async function processRequest(v) {
    const { procName, args } = await serializer.deserialize(v);
    if (procName in linter) {
      const res = await linter[procName](...args);
      postMessage(await serializer.serializeArg(res));
    }
  }
  self.onmessage = (e2) => {
    if (isSerializedRequest(e2.data)) {
      processRequest(e2.data);
    }
  };
};
var __viteBrowserExternal = {};
var __viteBrowserExternal$1 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  default: __viteBrowserExternal
});
`,f=typeof self<`u`&&self.Blob&&new Blob([`URL.revokeObjectURL(import.meta.url);`,d],{type:`text/javascript;charset=utf-8`});function p(e){let t;try{if(t=f&&(self.URL||self.webkitURL).createObjectURL(f),!t)throw``;let n=new Worker(t,{type:`module`,name:e?.name});return n.addEventListener(`error`,()=>{(self.URL||self.webkitURL).revokeObjectURL(t)}),n}catch{return new Worker(`data:text/javascript;charset=utf-8,`+encodeURIComponent(d),{type:`module`,name:e?.name})}}var m=class{constructor(e){s(this,`binary`),s(this,`serializer`),s(this,`dialect`),s(this,`worker`),s(this,`requestQueue`),s(this,`working`,!0),s(this,`disposed`,!1),this.binary=e.binary,this.serializer=new u(this.binary),this.dialect=e.dialect,this.worker=new p,this.requestQueue=[],this.worker.onmessage=()=>{this.setupMainEventListeners(),this.worker.postMessage([this.binary.url,this.dialect]),this.working=!1,this.submitRemainingRequests()}}setupMainEventListeners(){this.worker.onmessage=e=>{let{resolve:t}=this.requestQueue.shift();this.serializer.deserializeArg(e.data).then(e=>{t(e),this.working=!1,this.submitRemainingRequests()})},this.worker.onmessageerror=e=>{let{reject:t}=this.requestQueue.shift();t(e.data),this.working=!1,this.submitRemainingRequests()}}setup(){return this.rpc(`setup`,[])}lint(e,t){return this.rpc(`lint`,[e,t])}organizedLints(e,t){return this.rpc(`organizedLints`,[e,t])}applySuggestion(e,t,n){return this.rpc(`applySuggestion`,[e,t,n])}isLikelyEnglish(e){return this.rpc(`isLikelyEnglish`,[e])}isolateEnglish(e){return this.rpc(`isolateEnglish`,[e])}async getLintConfig(){return JSON.parse(await this.getLintConfigAsJSON())}setLintConfig(e){return this.setLintConfigWithJSON(JSON.stringify(e))}getLintConfigAsJSON(){return this.rpc(`getLintConfigAsJSON`,[])}setLintConfigWithJSON(e){return this.rpc(`setLintConfigWithJSON`,[e])}toTitleCase(e){return this.rpc(`toTitleCase`,[e])}getLintDescriptionsAsJSON(){return this.rpc(`getLintDescriptionsAsJSON`,[])}async getLintDescriptions(){return JSON.parse(await this.getLintDescriptionsAsJSON())}getLintDescriptionsHTMLAsJSON(){return this.rpc(`getLintDescriptionsHTMLAsJSON`,[])}async getLintDescriptionsHTML(){return JSON.parse(await this.getLintDescriptionsHTMLAsJSON())}getDefaultLintConfigAsJSON(){return this.rpc(`getDefaultLintConfigAsJSON`,[])}async getDefaultLintConfig(){return JSON.parse(await this.getDefaultLintConfigAsJSON())}async getStructuredLintConfig(){return JSON.parse(await this.getStructuredLintConfigJSON())}getStructuredLintConfigJSON(){return this.rpc(`getStructuredLintConfigJSON`,[])}async dispose(){this.disposed||(await this.rpc(`dispose`,[]),this.disposed=!0,this.requestQueue=[],this.worker.terminate())}ignoreLint(e,t){return this.rpc(`ignoreLint`,[e,t])}ignoreLintHash(e){return this.rpc(`ignoreLintHash`,[e])}exportIgnoredLints(){return this.rpc(`exportIgnoredLints`,[])}importIgnoredLints(e){return this.rpc(`importIgnoredLints`,[e])}contextHash(e,t){return this.rpc(`contextHash`,[e,t])}clearIgnoredLints(){return this.rpc(`clearIgnoredLints`,[])}clearWords(){return this.rpc(`clearWords`,[])}importWords(e){return this.rpc(`importWords`,[e])}exportWords(){return this.rpc(`exportWords`,[])}getDialect(){return this.rpc(`getDialect`,[])}setDialect(e){return this.rpc(`setDialect`,[e])}summarizeStats(e,t){return this.rpc(`summarizeStats`,[e,t])}generateStatsFile(){return this.rpc(`generateStatsFile`,[])}importStatsFile(e){return this.rpc(`importStatsFile`,[e])}async loadWeirpackFromBlob(e){let t=new Uint8Array(await e.arrayBuffer()),n=Array.from(t);return await this.rpc(`loadWeirpackFromBytes`,[n])}async loadWeirpackFromBytes(e){let t=Array.from(e);return await this.rpc(`loadWeirpackFromBytes`,[t])}async rpc(e,t){if(this.disposed)throw Error(`WorkerLinter has been disposed.`);return new Promise((n,r)=>{this.requestQueue.push({resolve:n,reject:r,request:{procName:e,args:t}}),this.submitRemainingRequests()})}async submitRemainingRequests(){if(!this.working)if(this.working=!0,this.requestQueue.length>0){let{request:e}=this.requestQueue[0],t=await this.serializer.serialize(e);this.worker.postMessage(t)}else this.working=!1}},h=Uint8Array,g=Uint16Array,_=Int32Array,v=new h([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),y=new h([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),b=new h([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),x=function(e,t){for(var n=new g(31),r=0;r<31;++r)n[r]=t+=1<<e[r-1];for(var i=new _(n[30]),r=1;r<30;++r)for(var a=n[r];a<n[r+1];++a)i[a]=a-n[r]<<5|r;return{b:n,r:i}},S=x(v,2),ee=S.b,C=S.r;ee[28]=258,C[258]=28;for(var w=x(y,0),T=w.b,E=w.r,D=new g(32768),O=0;O<32768;++O){var k=(O&43690)>>1|(O&21845)<<1;k=(k&52428)>>2|(k&13107)<<2,k=(k&61680)>>4|(k&3855)<<4,D[O]=((k&65280)>>8|(k&255)<<8)>>1}for(var A=function(e,t,n){for(var r=e.length,i=0,a=new g(t);i<r;++i)e[i]&&++a[e[i]-1];var o=new g(t);for(i=1;i<t;++i)o[i]=o[i-1]+a[i-1]<<1;var s;if(n){s=new g(1<<t);var c=15-t;for(i=0;i<r;++i)if(e[i])for(var l=i<<4|e[i],u=t-e[i],d=o[e[i]-1]++<<u,f=d|(1<<u)-1;d<=f;++d)s[D[d]>>c]=l}else for(s=new g(r),i=0;i<r;++i)e[i]&&(s[i]=D[o[e[i]-1]++]>>15-e[i]);return s},j=new h(288),O=0;O<144;++O)j[O]=8;for(var O=144;O<256;++O)j[O]=9;for(var O=256;O<280;++O)j[O]=7;for(var O=280;O<288;++O)j[O]=8;for(var M=new h(32),O=0;O<32;++O)M[O]=5;var te=A(j,9,0),N=A(j,9,1),ne=A(M,5,0),P=A(M,5,1),F=function(e){for(var t=e[0],n=1;n<e.length;++n)e[n]>t&&(t=e[n]);return t},I=function(e,t,n){var r=t/8|0;return(e[r]|e[r+1]<<8)>>(t&7)&n},L=function(e,t){var n=t/8|0;return(e[n]|e[n+1]<<8|e[n+2]<<16)>>(t&7)},R=function(e){return(e+7)/8|0},z=function(e,t,n){return(t==null||t<0)&&(t=0),(n==null||n>e.length)&&(n=e.length),new h(e.subarray(t,n))},B=[`unexpected EOF`,`invalid block type`,`invalid length/literal`,`invalid distance`,`stream finished`,`no stream handler`,,`no callback`,`invalid UTF-8 data`,`extra field too long`,`date not in range 1980-2099`,`filename too long`,`stream finishing`,`invalid zip data`],V=function(e,t,n){var r=Error(t||B[e]);if(r.code=e,Error.captureStackTrace&&Error.captureStackTrace(r,V),!n)throw r;return r},re=function(e,t,n,r){var i=e.length,a=r?r.length:0;if(!i||t.f&&!t.l)return n||new h(0);var o=!n,s=o||t.i!=2;o&&(n=new h(i*3));var c=function(e){var t=n.length;if(e>t){var r=new h(Math.max(t*2,e));r.set(n),n=r}},l=t.f||0,u=t.p||0,d=t.b||0,f=t.l,p=t.d,m=t.m,g=t.n,_=i*8;do{if(!f){l=I(e,u,1);var x=I(e,u+1,3);if(u+=3,!x){var S=R(u)+4,C=e[S-4]|e[S-3]<<8,w=S+C;if(w>i){V(0);break}s&&c(d+C),n.set(e.subarray(S,w),d),t.b=d+=C,t.p=u=w*8,t.f=l;continue}else if(x==1)f=N,p=P,m=9,g=5;else if(x==2){var E=I(e,u,31)+257,D=I(e,u+10,15)+4,O=E+I(e,u+5,31)+1;u+=14;for(var k=new h(O),j=new h(19),M=0;M<D;++M)j[b[M]]=I(e,u+M*3,7);u+=D*3;for(var te=F(j),ne=(1<<te)-1,B=A(j,te,1),M=0;M<O;){var re=B[I(e,u,ne)];u+=re&15;var S=re>>4;if(S<16)k[M++]=S;else{var H=0,U=0;for(S==16?(U=3+I(e,u,3),u+=2,H=k[M-1]):S==17?(U=3+I(e,u,7),u+=3):S==18&&(U=11+I(e,u,127),u+=7);U--;)k[M++]=H}}var ie=k.subarray(0,E),W=k.subarray(E);m=F(ie),g=F(W),f=A(ie,m,1),p=A(W,g,1)}else V(1);if(u>_){V(0);break}}s&&c(d+131072);for(var G=(1<<m)-1,ae=(1<<g)-1,oe=u;;oe=u){var H=f[L(e,u)&G],K=H>>4;if(u+=H&15,u>_){V(0);break}if(H||V(2),K<256)n[d++]=K;else if(K==256){oe=u,f=null;break}else{var q=K-254;if(K>264){var M=K-257,J=v[M];q=I(e,u,(1<<J)-1)+ee[M],u+=J}var Y=p[L(e,u)&ae],X=Y>>4;Y||V(3),u+=Y&15;var W=T[X];if(X>3){var J=y[X];W+=L(e,u)&(1<<J)-1,u+=J}if(u>_){V(0);break}s&&c(d+131072);var se=d+q;if(d<W){var ce=a-W,le=Math.min(W,se);for(ce+d<0&&V(3);d<le;++d)n[d]=r[ce+d]}for(;d<se;++d)n[d]=n[d-W]}}t.l=f,t.p=oe,t.b=d,t.f=l,f&&(l=1,t.m=m,t.d=p,t.n=g)}while(!l);return d!=n.length&&o?z(n,0,d):n.subarray(0,d)},H=function(e,t,n){n<<=t&7;var r=t/8|0;e[r]|=n,e[r+1]|=n>>8},U=function(e,t,n){n<<=t&7;var r=t/8|0;e[r]|=n,e[r+1]|=n>>8,e[r+2]|=n>>16},ie=function(e,t){for(var n=[],r=0;r<e.length;++r)e[r]&&n.push({s:r,f:e[r]});var i=n.length,a=n.slice();if(!i)return{t:J,l:0};if(i==1){var o=new h(n[0].s+1);return o[n[0].s]=1,{t:o,l:1}}n.sort(function(e,t){return e.f-t.f}),n.push({s:-1,f:25001});var s=n[0],c=n[1],l=0,u=1,d=2;for(n[0]={s:-1,f:s.f+c.f,l:s,r:c};u!=i-1;)s=n[n[l].f<n[d].f?l++:d++],c=n[l!=u&&n[l].f<n[d].f?l++:d++],n[u++]={s:-1,f:s.f+c.f,l:s,r:c};for(var f=a[0].s,r=1;r<i;++r)a[r].s>f&&(f=a[r].s);var p=new g(f+1),m=W(n[u-1],p,0);if(m>t){var r=0,_=0,v=m-t,y=1<<v;for(a.sort(function(e,t){return p[t.s]-p[e.s]||e.f-t.f});r<i;++r){var b=a[r].s;if(p[b]>t)_+=y-(1<<m-p[b]),p[b]=t;else break}for(_>>=v;_>0;){var x=a[r].s;p[x]<t?_-=1<<t-p[x]++-1:++r}for(;r>=0&&_;--r){var S=a[r].s;p[S]==t&&(--p[S],++_)}m=t}return{t:new h(p),l:m}},W=function(e,t,n){return e.s==-1?Math.max(W(e.l,t,n+1),W(e.r,t,n+1)):t[e.s]=n},G=function(e){for(var t=e.length;t&&!e[--t];);for(var n=new g(++t),r=0,i=e[0],a=1,o=function(e){n[r++]=e},s=1;s<=t;++s)if(e[s]==i&&s!=t)++a;else{if(!i&&a>2){for(;a>138;a-=138)o(32754);a>2&&(o(a>10?a-11<<5|28690:a-3<<5|12305),a=0)}else if(a>3){for(o(i),--a;a>6;a-=6)o(8304);a>2&&(o(a-3<<5|8208),a=0)}for(;a--;)o(i);a=1,i=e[s]}return{c:n.subarray(0,r),n:t}},ae=function(e,t){for(var n=0,r=0;r<t.length;++r)n+=e[r]*t[r];return n},oe=function(e,t,n){var r=n.length,i=R(t+2);e[i]=r&255,e[i+1]=r>>8,e[i+2]=e[i]^255,e[i+3]=e[i+1]^255;for(var a=0;a<r;++a)e[i+a+4]=n[a];return(i+4+r)*8},K=function(e,t,n,r,i,a,o,s,c,l,u){H(t,u++,n),++i[256];for(var d=ie(i,15),f=d.t,p=d.l,m=ie(a,15),h=m.t,_=m.l,x=G(f),S=x.c,ee=x.n,C=G(h),w=C.c,T=C.n,E=new g(19),D=0;D<S.length;++D)++E[S[D]&31];for(var D=0;D<w.length;++D)++E[w[D]&31];for(var O=ie(E,7),k=O.t,N=O.l,P=19;P>4&&!k[b[P-1]];--P);var F=l+5<<3,I=ae(i,j)+ae(a,M)+o,L=ae(i,f)+ae(a,h)+o+14+3*P+ae(E,k)+2*E[16]+3*E[17]+7*E[18];if(c>=0&&F<=I&&F<=L)return oe(t,u,e.subarray(c,c+l));var R,z,B,V;if(H(t,u,1+(L<I)),u+=2,L<I){R=A(f,p,0),z=f,B=A(h,_,0),V=h;var re=A(k,N,0);H(t,u,ee-257),H(t,u+5,T-1),H(t,u+10,P-4),u+=14;for(var D=0;D<P;++D)H(t,u+3*D,k[b[D]]);u+=3*P;for(var W=[S,w],K=0;K<2;++K)for(var q=W[K],D=0;D<q.length;++D){var J=q[D]&31;H(t,u,re[J]),u+=k[J],J>15&&(H(t,u,q[D]>>5&127),u+=q[D]>>12)}}else R=te,z=j,B=ne,V=M;for(var D=0;D<s;++D){var Y=r[D];if(Y>255){var J=Y>>18&31;U(t,u,R[J+257]),u+=z[J+257],J>7&&(H(t,u,Y>>23&31),u+=v[J]);var X=Y&31;U(t,u,B[X]),u+=V[X],X>3&&(U(t,u,Y>>5&8191),u+=y[X])}else U(t,u,R[Y]),u+=z[Y]}return U(t,u,R[256]),u+z[256]},q=new _([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),J=new h(0),Y=function(e,t,n,r,i,a){var o=a.z||e.length,s=new h(r+o+5*(1+Math.ceil(o/7e3))+i),c=s.subarray(r,s.length-i),l=a.l,u=(a.r||0)&7;if(t){u&&(c[0]=a.r>>3);for(var d=q[t-1],f=d>>13,p=d&8191,m=(1<<n)-1,b=a.p||new g(32768),x=a.h||new g(m+1),S=Math.ceil(n/3),ee=2*S,w=function(t){return(e[t]^e[t+1]<<S^e[t+2]<<ee)&m},T=new _(25e3),D=new g(288),O=new g(32),k=0,A=0,j=a.i||0,M=0,te=a.w||0,N=0;j+2<o;++j){var ne=w(j),P=j&32767,F=x[ne];if(b[P]=F,x[ne]=P,te<=j){var I=o-j;if((k>7e3||M>24576)&&(I>423||!l)){u=K(e,c,0,T,D,O,A,M,N,j-N,u),M=k=A=0,N=j;for(var L=0;L<286;++L)D[L]=0;for(var L=0;L<30;++L)O[L]=0}var B=2,V=0,re=p,H=P-F&32767;if(I>2&&ne==w(j-H))for(var U=Math.min(f,I)-1,ie=Math.min(32767,j),W=Math.min(258,I);H<=ie&&--re&&P!=F;){if(e[j+B]==e[j+B-H]){for(var G=0;G<W&&e[j+G]==e[j+G-H];++G);if(G>B){if(B=G,V=H,G>U)break;for(var ae=Math.min(H,G-2),J=0,L=0;L<ae;++L){var Y=j-H+L&32767,X=Y-b[Y]&32767;X>J&&(J=X,F=Y)}}}P=F,F=b[P],H+=P-F&32767}if(V){T[M++]=268435456|C[B]<<18|E[V];var se=C[B]&31,ce=E[V]&31;A+=v[se]+y[ce],++D[257+se],++O[ce],te=j+B,++k}else T[M++]=e[j],++D[e[j]]}}for(j=Math.max(j,te);j<o;++j)T[M++]=e[j],++D[e[j]];u=K(e,c,l,T,D,O,A,M,N,j-N,u),l||(a.r=u&7|c[u/8|0]<<3,u-=7,a.h=x,a.p=b,a.i=j,a.w=te)}else{for(var j=a.w||0;j<o+l;j+=65535){var le=j+65535;le>=o&&(c[u/8|0]=l,le=o),u=oe(c,u+1,e.subarray(j,le))}a.i=o}return z(s,0,r+R(u)+i)},X=function(){for(var e=new Int32Array(256),t=0;t<256;++t){for(var n=t,r=9;--r;)n=(n&1&&-306674912)^n>>>1;e[t]=n}return e}(),se=function(){var e=-1;return{p:function(t){for(var n=e,r=0;r<t.length;++r)n=X[n&255^t[r]]^n>>>8;e=n},d:function(){return~e}}},ce=function(e,t,n,r,i){if(!i&&(i={l:1},t.dictionary)){var a=t.dictionary.subarray(-32768),o=new h(a.length+e.length);o.set(a),o.set(e,a.length),e=o,i.w=a.length}return Y(e,t.level==null?6:t.level,t.mem==null?i.l?Math.ceil(Math.max(8,Math.min(13,Math.log(e.length)))*1.5):20:12+t.mem,n,r,i)},le=function(e,t){var n={};for(var r in e)n[r]=e[r];for(var r in t)n[r]=t[r];return n},Z=function(e,t){return e[t]|e[t+1]<<8},Q=function(e,t){return(e[t]|e[t+1]<<8|e[t+2]<<16|e[t+3]<<24)>>>0},ue=function(e,t){return Q(e,t)+Q(e,t+4)*4294967296},$=function(e,t,n){for(;n;++t)e[t]=n,n>>>=8};function de(e,t){return ce(e,t||{},0,0)}function fe(e,t){return re(e,{i:2},t&&t.out,t&&t.dictionary)}var pe=function(e,t,n,r){for(var i in e){var a=e[i],o=t+i,s=r;Array.isArray(a)&&(s=le(r,a[1]),a=a[0]),a instanceof h?n[o]=[a,s]:(n[o+=`/`]=[new h(0),s],pe(a,o,n,r))}},me=typeof TextEncoder<`u`&&new TextEncoder,he=typeof TextDecoder<`u`&&new TextDecoder;try{he.decode(J,{stream:!0})}catch{}var ge=function(e){for(var t=``,n=0;;){var r=e[n++],i=(r>127)+(r>223)+(r>239);if(n+i>e.length)return{s:t,r:z(e,n-1)};i?i==3?(r=((r&15)<<18|(e[n++]&63)<<12|(e[n++]&63)<<6|e[n++]&63)-65536,t+=String.fromCharCode(55296|r>>10,56320|r&1023)):i&1?t+=String.fromCharCode((r&31)<<6|e[n++]&63):t+=String.fromCharCode((r&15)<<12|(e[n++]&63)<<6|e[n++]&63):t+=String.fromCharCode(r)}};function _e(e,t){var n;if(me)return me.encode(e);for(var r=e.length,i=new h(e.length+(e.length>>1)),a=0,o=function(e){i[a++]=e},n=0;n<r;++n){if(a+5>i.length){var s=new h(a+8+(r-n<<1));s.set(i),i=s}var c=e.charCodeAt(n);c<128||t?o(c):c<2048?(o(192|c>>6),o(128|c&63)):c>55295&&c<57344?(c=65536+(c&1047552)|e.charCodeAt(++n)&1023,o(240|c>>18),o(128|c>>12&63),o(128|c>>6&63),o(128|c&63)):(o(224|c>>12),o(128|c>>6&63),o(128|c&63))}return z(i,0,a)}function ve(e,t){if(t){for(var n=``,r=0;r<e.length;r+=16384)n+=String.fromCharCode.apply(null,e.subarray(r,r+16384));return n}else if(he)return he.decode(e);else{var i=ge(e),a=i.s,n=i.r;return n.length&&V(8),a}}var ye=function(e,t){return t+30+Z(e,t+26)+Z(e,t+28)},be=function(e,t,n){var r=Z(e,t+28),i=ve(e.subarray(t+46,t+46+r),!(Z(e,t+8)&2048)),a=t+46+r,o=Q(e,t+20),s=n&&o==4294967295?xe(e,a):[o,Q(e,t+24),Q(e,t+42)],c=s[0],l=s[1],u=s[2];return[Z(e,t+10),c,l,i,a+Z(e,t+30)+Z(e,t+32),u]},xe=function(e,t){for(;Z(e,t)!=1;t+=4+Z(e,t+2));return[ue(e,t+12),ue(e,t+4),ue(e,t+20)]},Se=function(e){var t=0;if(e)for(var n in e){var r=e[n].length;r>65535&&V(9),t+=r+4}return t},Ce=function(e,t,n,r,i,a,o,s){var c=r.length,l=n.extra,u=s&&s.length,d=Se(l);$(e,t,o==null?67324752:33639248),t+=4,o!=null&&(e[t++]=20,e[t++]=n.os),e[t]=20,t+=2,e[t++]=n.flag<<1|(a<0&&8),e[t++]=i&&8,e[t++]=n.compression&255,e[t++]=n.compression>>8;var f=new Date(n.mtime==null?Date.now():n.mtime),p=f.getFullYear()-1980;if((p<0||p>119)&&V(10),$(e,t,p<<25|f.getMonth()+1<<21|f.getDate()<<16|f.getHours()<<11|f.getMinutes()<<5|f.getSeconds()>>1),t+=4,a!=-1&&($(e,t,n.crc),$(e,t+4,a<0?-a-2:a),$(e,t+8,n.size)),$(e,t+12,c),$(e,t+14,d),t+=16,o!=null&&($(e,t,u),$(e,t+6,n.attrs),$(e,t+10,o),t+=14),e.set(r,t),t+=c,d)for(var m in l){var h=l[m],g=h.length;$(e,t,+m),$(e,t+2,g),e.set(h,t+4),t+=4+g}return u&&(e.set(s,t),t+=u),t},we=function(e,t,n,r,i){$(e,t,101010256),$(e,t+8,n),$(e,t+10,n),$(e,t+12,r),$(e,t+16,i)};function Te(e,t){t||={};var n={},r=[];pe(e,``,n,t);var i=0,a=0;for(var o in n){var s=n[o],c=s[0],l=s[1],u=l.level==0?0:8,d=_e(o),f=d.length,p=l.comment,m=p&&_e(p),g=m&&m.length,_=Se(l.extra);f>65535&&V(11);var v=u?de(c,l):c,y=v.length,b=se();b.p(c),r.push(le(l,{size:c.length,crc:b.d(),c:v,f:d,m,u:f!=o.length||m&&p.length!=g,o:i,compression:u})),i+=30+f+_+y,a+=76+2*(f+_)+(g||0)+y}for(var x=new h(a+22),S=i,ee=a-i,C=0;C<r.length;++C){var d=r[C];Ce(x,d.o,d,d.f,d.u,d.c.length);var w=30+d.f.length+Se(d.extra);x.set(d.c,d.o+w),Ce(x,i,d,d.f,d.u,d.c.length,d.o,d.m),i+=16+w+(d.m?d.m.length:0)}return we(x,i,r.length,ee,S),x}function Ee(e,t){for(var n={},r=e.length-22;Q(e,r)!=101010256;--r)(!r||e.length-r>65558)&&V(13);var i=Z(e,r+8);if(!i)return{};var a=Q(e,r+16),o=a==4294967295||i==65535;if(o){var s=Q(e,r-12);o=Q(e,s)==101075792,o&&(i=Q(e,s+32),a=Q(e,s+48))}for(var c=0;c<i;++c){var l=be(e,a,o),u=l[0],d=l[1],f=l[2],p=l[3],m=l[4],g=l[5],_=ye(e,g);a=m,u?u==8?n[p]=fe(e.subarray(_,_+d),{out:new h(f)}):V(14,`unknown compression type `+u):n[p]=z(e,_,_+d)}return n}var De=`manifest.json`;function Oe(e){if(!e.has(De))throw Error(`Weirpack is missing manifest.json`);let t={};for(let[n,r]of e.entries())t[n]=_e(r);return Te(t,{level:6})}function ke(e){let t=Ee(e),n=t[De];if(!n)throw Error(`Weirpack is missing manifest.json`);let r=ve(n),i=JSON.parse(r),a=new Map;a.set(De,r);let o=Object.keys(t);o.sort();for(let e of o){let n=t[e];!n||e===De||a.set(e,ve(n))}return{manifest:i,files:a}}export{n as Dialect,c as LocalLinter,e as SuggestionKind,m as WorkerLinter,r as createBinaryModuleFromUrl,Oe as packWeirpackFiles,ke as unpackWeirpackBytes};