/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue"
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module "fabric" {
  export const fabric: any
  export class Canvas {
    constructor(element: HTMLCanvasElement, options?: any)
    [key: string]: any
  }
  export class Line {
    constructor(points: number[], options?: any)
    [key: string]: any
  }
  export class Rect {
    constructor(options?: any)
    [key: string]: any
  }
  export class Group {
    constructor(objects: any[], options?: any)
    [key: string]: any
  }
}



declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  export * from "three/examples/jsm/loaders/GLTFLoader"
} 