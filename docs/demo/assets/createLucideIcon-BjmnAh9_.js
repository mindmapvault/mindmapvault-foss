import{r as o,I as n,m as C}from"./index-DlJzyi04.js";/**
 * @license lucide-react v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(a,s,t)=>t?t.toUpperCase():s.toLowerCase());/**
 * @license lucide-react v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r=e=>{const a=m(e);return a.charAt(0).toUpperCase()+a.slice(1)};/**
 * @license lucide-react v1.14.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=(e,a)=>{const s=o.forwardRef(({className:t,...c},l)=>o.createElement(n,{ref:l,iconNode:a,className:C(`lucide-${p(r(e))}`,`lucide-${e}`,t),...c}));return s.displayName=r(e),s};export{u as c};
