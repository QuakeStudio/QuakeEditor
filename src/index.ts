// @ts-nocheck
;(async function (Scratch) {
  if (Scratch.extensions.unsandboxed === false) {
    throw new Error('Sandboxed mode is not supported')
  }
  const config = await import('./config')
  const id = config.id
  const vm = Scratch.vm
  const runtime = vm.runtime
  const monaco = await import('./MonacoEditor/monaco')
  const MonacoEditor = new monaco.MonacoEditor(Scratch)
  await MonacoEditor.init()
  class QuakeEditor {
    getInfo() {
      return {
        id,
        name: 'QuakeEditor',
        blocks: [
          {
            blockType: Scratch.BlockType.REPORTER,
            outputShape: 3,
            opcode: 'glslTextEditor',
            text: 'test [code]',
            arguments: {
              code: {
                type: 'code_glsl',
                defaultValue: `uniform float speed;
uniform float xDistortion;
uniform float xMagnitude;
uniform float yDistortion;
uniform float yMagnitude;

void main() {
    float slowerTime = speed * time;

    // Time-dependent periodic disturbance
    float dx = xDistortion * sin(vUv.y * xMagnitude + slowerTime);
    float dy = yDistortion * sin(vUv.x * yMagnitude + slowerTime);
    
    // Shift UV coordinates over time
    vec2 disturbedUv = vec2(vUv.x + dx, vUv.y + dy);

    // Sample the texture at the disturbed UV coordinates
    vec4 color = texture(tDiffuse, disturbedUv);

    fragColor = color;
}` //#ff0000,
              }
            }
          },
          {
            blockType: Scratch.BlockType.REPORTER,
            opcode: 'test',
            text: 'test [a]',
            arguments: {
              a: {
                type: 'string',
                defaultValue: '3'
              }
            }
          }
        ],
        customFieldTypes: Object.fromEntries(
          MonacoEditor.languages.map(v => [
            `code_${v}`,
            { output: 'string', outputShape: 3 }
          ])
        )
      }
    }
    async glslTextEditor({ code }, util) {
      return Scratch.Cast.toString(code)
    }
  }
  Scratch.extensions.register(new QuakeEditor())
})(Scratch)