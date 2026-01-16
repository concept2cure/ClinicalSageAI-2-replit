import React, { useState } from 'react';

export default function ReactFlow(props) {
  return <div {...props}>{props.children}</div>;
}

export function MiniMap() {
  return null;
}

export function Controls() {
  return null;
}

export function Background() {
  return null;
}

export function useNodesState(initial) {
  const state = useState(initial);
  const onChange = () => {};
  return [state[0], state[1], onChange];
}

export function useEdgesState(initial) {
  const state = useState(initial);
  const onChange = () => {};
  return [state[0], state[1], onChange];
}

export function addEdge(params, edges) {
  return edges.concat({ id: `e${Date.now()}`, ...params });
}
