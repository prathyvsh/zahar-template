import * as z from './z.js';

const listView = (list) => ["ul", ...list.map(x => ["li", x])];

const dateLogger = (evt, state) => state.list.push(new Date().toString());

z.render(document.body, (state) => ["div", ["button", {events: {click: dateLogger}}, "Start by clicking here"], listView(state.list)], {list: []});
