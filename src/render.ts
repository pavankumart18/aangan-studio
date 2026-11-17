import type { WebGLRenderer } from 'three'

let gl: WebGLRenderer | null = null
export const registerGL = (r: WebGLRenderer | null) => {
  gl = r
}
export const currentGL = () => gl
export const screenshot3D = () => gl?.domElement.toDataURL('image/png') ?? null
