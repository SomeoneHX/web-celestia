/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module '*.glsl?raw' {
  const src: string;
  export default src;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
