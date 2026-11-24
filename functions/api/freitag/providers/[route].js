import { forwardFreitagRequest } from "../[route].js";

export function onRequest(context) { return forwardFreitagRequest(context, true); }
