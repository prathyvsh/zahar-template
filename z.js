import * as f from './fun.js';

/* Checks */

const isTextNode = n => (typeof n == "string" || typeof n == "number");

const areAttrs = attrs => (typeof attrs == "object" && !Array.isArray(attrs));

const isTag = tag => typeof tag == "string";

const isNode = node => {

    if(f.isArr(node) && isTag(f.head(node))) {

	let {tag, attrs} = normalizeNode(node);

	/* There needs to be a better way to express this. Use some kind of grammar may be? */
	return areAttrs(attrs);

    }

    return false;

};

/* Accessors */

const getAttr = (n, key) => {

    let {tag, attrs} = normalizeNode(n)[1];

    return attrs[key];
    
};

/* Helpers */

const replaceTag = tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[tag] || tag;

const escapeHTML = str => str.replace(/[&<>]/g, replaceTag);

const $ = x => document.querySelector(x);

const $all = (x) => document.querySelectorAll(x);

const node$ = (node,x) => node.querySelector(x);

const node$all = (node,x) => node.querySelectorAll(x);

const clearChildren = el => {

    while(el.hasChildNodes()) el.removeChild(el.lastChild);

};

/* Normalization */

const processTag = (tag) => {

    let attrs = {};

    let idStart = tag.indexOf("#"), id = null;

    if(idStart > 0) {
	
	let idEnd = tag.indexOf(".", idStart);

	if(idEnd < 0) idEnd = tag.length;

	id = tag.slice(idStart + 1, idEnd);

	tag = tag.slice(0, idStart) + tag.slice(idEnd);

    }

    let [parsed_tag, ...classes] = tag.split(".");

    Object.assign(attrs, id && {id}, (classes.length > 0) && {class: classes.join(" ")});

    return [parsed_tag, attrs || {}];
    
};

const normalizeNode = (zNode) => {

    if(isTextNode(zNode)) return {tag: "textNode", attrs: {}, contents: [zNode]};

    try {
	
    let [tag, ...contents] = zNode;

    if(typeof tag == "string") {

	let attrs = {};

	if(areAttrs(contents[0])) {

	    attrs = contents[0];

	    attrs = f.kvmap((k,v) => ({[k]: ((v instanceof Array) ? v.join(" ") : v)}), attrs);

	    contents = contents.slice(1);
	    
	}

	let [parsed_tag, parsed_attrs] = processTag(tag);

	Object.assign(attrs, parsed_attrs);

	return {tag: parsed_tag, attrs, contents};

    }
	else throw Error("Cannot normalize: " + JSON.stringify(zNode));

    } catch (e) {
	
	throw Error("Cannot normalize: " + JSON.stringify(zNode));
    }
    
};

const normalizeTree = (tree, key = [0], {withKeys = true, transformer = x => x} = {}) => {

    let {tag, attrs, contents} = transformer(normalizeNode(tree));

    if(tag == "textNode") return {key, tag, attrs, contents};

    let obj = {tag, attrs};

    if(withKeys) obj = f.merge(obj, {key});

    contents = contents.map((child, i) => {

	let childKey = Array.from(key);
	
	if(withKeys) childKey.push(i);

	return normalizeTree(child, childKey, {withKeys, transformer});

    });

    return f.merge(obj, {contents});
    
};


const normalize = (tree, {withKeys = true, transformer} = {}) => normalizeTree(tree, [0], {withKeys, transformer});

const attachEvents = (el, events = {}, state) =>
      f.kvmap((k,v) =>
	      el.addEventListener(k, async (e) => {

		  await v(e, state);

		  await render(state.parentNode, state.viewBuilder, state);

	      }), events);

const genKey = (el, key) => el.dataset.key = key.join(".");

const htmlNode = (nNode, state) => {

    let {key, tag, attrs, contents} = nNode;

    if(tag == "textNode") {
	
	return document.createTextNode(contents);

    };

    const el = document.createElement(tag);

    if(attrs) setAttrs(el, f.dissoc(attrs, "events"));

    // genKey(el, key);

    attachEvents(el, attrs.events || {}, state);

    contents.forEach(child => el.appendChild(dom(child, state)));

    return el;

};

const dom = (node, state, {isSerialized, domBuilder = htmlNode} = {}) => {

    if(node.tag) {

	return isSerialized ? nodeToText(node, state) : domBuilder(node, state);

    } else {
	
	throw Error("Unknown element to generate: " + JSON.stringify(node));
    }

};

const joinKV = (joiner, transform = (x => x)) => ([k, v]) => k + joiner + transform(v);

const serializeStyle = s => Object.entries(s).map(joinKV(":")).join(";");

const dataPair = (k,dk, dv) => [k + "-" + dk, dv];

const setAttrs = (el,attrs = {}) => f.kvmap((k,v) => {

    if(k == "style") el.setAttribute(k, serializeStyle(v));

    else if(k == "data") f.kvmap((dk, dv) => el.setAttribute(...dataPair(k,dk,dv)), v);

    else el.setAttribute(k,v);

}, attrs);

const attrsToStr = attrs => {

    const escapeStr = (st, c) => (typeof st == "string") ? `"${st}"` : st;

    const parseAttrs = ([k, v]) => {
	
	if(k == "style")  {
	    
	    return `${k}='${serializeStyle(v)}'`;

	} else if(k == "data") {

	    return Object.entries(v).map(([key, val]) => dataPair(k,key,val));
	    
	} else {

	    return joinKV("=", escapeStr)([k, v]);
	    
	}

    };

    return Object.entries(attrs).map(parseAttrs).join(" ");

};

const nodeToText = (normalizedNode, state) => {

    let {key, tag, attrs, contents} = normalizedNode;

    if(key) { attrs = Object.assign(attrs, {data: {key}}); };

    if(!tag) throw Error("Please provide a tag");

    let newAttrs = f.dissoc(attrs, "events");

    let attrsStr = attrsToStr(newAttrs);
    
    return `<${tag}${(attrsStr) ? " " + attrsStr : ""}>${contents.map((n, i) => {

     if(key) key.push(i);

      return serialize(n, {state, withKeys: (key != null)});

}).join("")}</${tag}>`;

};

const serialize = (n, {state, key = [0], withKeys} = {withKeys: false}) => dom(normalizeTree(n, key, {withKeys, isSerialized: true}), state, {isSerialized: true});

/* DOM Operations */

const updateNode = (domNode, diff, state, domBuilder) => {

    let {add, sub} = diff;

    let parentNode = domNode.parentNode;

    if(!f.isEmpty(add) && !f.isEmpty(sub)) {
	
    parentNode.replaceChild(domBuilder(add, state), domNode);

    }

    else if(!f.isEmpty(add)) domNode.appendChild(domBuilder(add, state));

    else if(!f.isEmpty(sub)) {

	parentNode.removeChild(domNode);

    }

};

const setNestedAttrs = (node, attr, vals) => f.kvmap((k,{add, sub}) => {

    if(sub) node[attr][k] = "";
    if(add) node[attr][k] = add;

}, vals);

const setAttrDiffs = (node, attr, vals) => {

    if(attr == "style") {

	setNestedAttrs(node, "style", vals);
	
    } else if(attr == "data") {

	setNestedAttrs(node, "dataset", vals);
	
    } else {

	let {add, sub} = vals;

	if(sub) node.removeAttribute(attr);

	if(add) node.setAttribute(attr, add);
	
    };
    
};

const changeAttrs = (domNode, diff) => f.kvmap((k,diffs) => setAttrDiffs(domNode, k, diffs), diff || {});

const changeContents = (domNode, diffs, state, domBuilder) => {

    let array = Array.from(domNode.childNodes);

    diffs.map((diff, i) => {

	renderDiff((array[i]) || domNode, diff, state, domBuilder);

    });
}

const renderDiff = (domNode, diff, state, domBuilder) => {

    if(diff) {

	let {textNode = {}, node = {}, attrs = {}, contents = []} = diff;

	if(!f.isEmpty(node) && (node["add"] || node["sub"])) {

	    updateNode(domNode, node, state, domBuilder);

	} else {
	    
	    changeAttrs(domNode, attrs);

	    changeContents(domNode, contents, state, domBuilder);

	};

    }
    
};

/* Return type is: [{type: "node" | "attrs" | "content", diff: [diffs..]}] */
/* Content is [Node] */

const diffContent = (content1, content2, {showEq}) => {
    
let results = f.map((x,y) => diff(x,y, {showEq}), ...f.normalizeArrs(content1, content2));

return f.isAny(x => x != null, results) ? results : null;

}

/* TODO: Return only the entities which has add andd sub in them */
const diff = (node1, node2, {showEq = false} = {}) => {

    if(!node1 && !node2) return null;

    if(!node1 || !node2) return {key: node1 && node1.key || node2 && node2.key, node: f.diff(node1, node2, {showEq})};

    else if(f.isObj(node1) && f.isObj(node2)) {

	const {key: key1, tag: tag1, attrs: attrs1, contents: contents1} = node1;

	const {key: key2, tag: tag2, attrs: attrs2, contents: contents2} = node2;

	const key = key1 || key2;

	if(tag1 == "textNode" && tag2 == "textNode") {

	    if(contents1[0] != contents2[0]) {

		return {key, node: {"sub": node1, "add": node2}};

	    } else {

		return null;

	    }

	};

	if(tag1 != tag2) return {key, node: {"sub": node1, "add": node2}};

	const attrs = f.diff(attrs1, attrs2, {showEq});

	const contents = diffContent(contents1, contents2, {showEq});

	return f.notEmpty(f.merge({...(f.isEmpty(attrs) ? {} : {attrs}), ...(f.isEmpty(contents) ? {}: {contents})}));

    } else {

	throw Error("Unknown Items Passed: " + JSON.stringify(node1) + JSON.stringify(node2));
	
    };

};

/* A tree is either: 
   string
   [tag: string]
   [tag: string, attrs: object]
   [tag: string, tree+]
   [tag: string, attrs: object, tree+] */

/*
  Clears the parentNode and then append a DOM on it.
  Parent node can either be a string to query the DOM with z.$() or
  a node.
*/

const buildView = async (viewFn, state, normalizer) => {

    let view = null;

    if(typeof viewFn == "function") {

	view = await viewFn(state);

    } else {

	view = viewFn;

    };

    return normalizer(view, [0], {withKeys: true});

};

const init = (parentNode, DOM) => {

    clearChildren(parentNode);

    parentNode.appendChild(DOM);

};

const render = async (parentNode, view, state = {}, {normalizer = normalize, domBuilder = htmlNode} = {}) => {

    state.viewBuilder = view;
    
    state.parentNode = parentNode;

    state.redraw = (state.redraw && state.redraw + 1) || 0;

    if(typeof parentNode == "string") { parentNode = $(parentNode); };
    
    view = await buildView(state.viewBuilder, state, normalizer);

    if(state.pastView) {

	let delta = diff(state.pastView, view);

	renderDiff(parentNode.firstChild, delta, state, domBuilder);

    } else {
	
	init(parentNode, dom(view, state, {domBuilder}));

    }

    state.pastView = view;

};

const doc = (head = "", body = "") => {

    if(!body) {

	body = head;

	head = "";

    }

    return "<!doctype html>" + serialize(["html", ["head", ...head], ["body", ...body]]);

};

const css = link => serialize(["link", {rel: "stylesheet", type: "text/css", href: link}]);

const nodejsZ = {serialize, doc, css, isNode};

if(typeof module !== "undefined" && module.exports) module.exports = nodejsZ;

export {$, $all, node$, node$all, doc, clearChildren, setAttrs, dom, serialize, render, css, diff, normalize, normalizeNode};
