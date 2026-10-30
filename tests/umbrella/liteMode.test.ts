import { describe, expect, it } from 'vitest'
import { isWeakGpu } from '@/umbrella/liteMode'

describe('weak phones: the GPU families that start in the light look', () => {
  it('matches every GPU a slow Poki playtest named', () => {
    for (const r of [
      'Adreno (TM) 505',
      'ANGLE (ARM, Mali-G52 MC2, OpenGL ES 3.2)',
      'Mali-G57 MC2',
      'ANGLE (ARM, Mali-G57, OpenGL ES 3.2)',
      'Mali-T860',
      'ANGLE (Imagination Technologies, PowerVR Rogue GE8320, OpenGL ES 3.2)',
      'Adreno (TM) 308',
      'Mali-400 MP'
    ]) expect(isWeakGpu(r), r).toBe(true)
  })

  it('leaves capable phones and desktops in the full look', () => {
    for (const r of [
      'Adreno (TM) 650',
      'Adreno (TM) 740',
      'ANGLE (ARM, Mali-G78 MP14, OpenGL ES 3.2)',
      'Mali-G710 MC10',
      'Apple GPU',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'
    ]) expect(isWeakGpu(r), r).toBe(false)
  })
})
