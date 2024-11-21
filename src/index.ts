// @ts-nocheck
;(async function (Scratch) {
  if (Scratch.extensions.unsandboxed === false) {
    throw new Error('Sandboxed mode is not supported')
  }
  const id = 'python'
  const vm = Scratch.vm
  const runtime = vm.runtime
  const Monaco = await import(
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/+esm'
  )
  const glslConfig = require('./glslSyntaxHighlighting')

  Monaco.languages.register({ id: 'glsl' });
  Monaco.languages.setLanguageConfiguration('glsl', glslConfig.conf);
  Monaco.languages.setMonarchTokensProvider('glsl', glslConfig.language);

  const languages = Monaco.languages.getLanguages().map(v => v.id)
  Scratch.gui.getBlockly().then(async ScratchBlocks => {
    ScratchBlocks._LightenDarkenColor = function (col, amt) {
      const num = parseInt(col.replace('#', ''), 16)
      const r = (num >> 16) + amt
      const b = ((num >> 8) & 0x00ff) + amt
      const g = (num & 0x0000ff) + amt
      const newColor = g | (b << 8) | (r << 16)
      return (col.at(0) === '#' ? '#' : '') + newColor.toString(16)
    }
    function _setCssNattr(node, attr, value) {
      node.setAttribute(attr, String(value))
      node.style[attr] = value
    }
    function _delCssNattr(node, attr) {
      node.removeAttribute(attr)
      delete node.style[attr]
    }

    // These should NEVER be called without ScratchBlocks existing
    function _fixColours(doText, col1, textColor) {
      const LDA = -10
      const LDC = ScratchBlocks._LightenDarkenColor
      const self = this.sourceBlock_
      const parent = self?.parentBlock_
      if (!parent) return
      const path = self?.svgPath_
      const argumentSvg = path?.parentNode
      const textNode = argumentSvg.querySelector('g.blocklyEditableText text')
      const oldFirstColour = parent.colour_
      self.colour_ = col1 ?? LDC(parent.colour_, LDA)
      self.colourSecondary_ = LDC(parent.colourSecondary_, LDA)
      self.colourTertiary_ = LDC(parent.colourTertiary_, LDA)
      self.colourQuaternary_ = LDC(
        parent?.colourQuaternary_ ?? oldFirstColour,
        LDA
      )
      _setCssNattr(path, 'fill', self.colour_)
      _setCssNattr(path, 'stroke', self.colourTertiary_)
      if (doText && textNode)
        _setCssNattr(textNode, 'fill', textColor ?? '#FFFFFF')
    }
    const _endBlockDrag = ScratchBlocks.BlockDragger.prototype.endBlockDrag
    ScratchBlocks.BlockDragger.prototype.endBlockDrag = function (a, b) {
      _endBlockDrag.call(this, a, b)
      for (const childBlock of this.draggingBlock_.childBlocks_) {
        if (
          childBlock.inputList.length === 1 &&
          childBlock.inputList[0].fieldRow.length === 1 &&
          childBlock.inputList[0].fieldRow[0]
        ) {
          const field = childBlock.inputList[0].fieldRow[0]
          if (field.constructor.inline === true) {
            childBlock.render()
          }
          if (field.constructor.acceptReporters === false) {
            childBlock.outputConnection.targetConnection.setHidden(true)
          }
        }
      }
    }
    // based on https://github.com/LLK/scratch-blocks/blob/893c7e7ad5bfb416eaed75d9a1c93bdce84e36ab/core/field_angle.js
    class FieldCode extends ScratchBlocks.Field {
      static inline = true
      static acceptReporters = true
      constructor(opt_value, option) {
        opt_value = opt_value && !isNaN(opt_value) ? String(opt_value) : ''
        super(opt_value)
        this.option = option
        this.addArgType('String')
        this.addArgType('code')
      }
      updateWidth() {
        if (this._textarea) {
          const width = this._textarea.offsetWidth + 1,
            height = this._textarea.offsetHeight + 1
          this._textareaHolder.setAttribute('width', String(width + 3))
          this._textareaHolder.setAttribute('height', String(height + 3))
          this.size_.width = width + 8
          this.size_.height = height + 16
        }
      }
      dispose() {
        super.dispose()
        this.editorInstance.dispose()
        delete this.editorInstance
      }
      init(...initArgs) {
        ScratchBlocks.Field.prototype.init.call(this, ...initArgs)
        const textNode = this.sourceBlock_.svgPath_.parentNode.querySelector(
          'g.blocklyEditableText text'
        )
        if (textNode) textNode.style.display = 'none'
        if (this.sourceBlock_.parentBlock_)
          _fixColours.call(this, false, this.sourceBlock_.parentBlock_.colour_)
        const textareaHolder = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'foreignObject'
        )
        textareaHolder.setAttribute('x', '16')
        textareaHolder.setAttribute('y', '8')
        textareaHolder.addEventListener('mousedown', e => e.stopPropagation())
        const div = document.createElement('div')
        if (this.editorInstance) this.editorInstance.dispose()
        div.style.width = '1000px'
        div.style.height = '600px'
        this.editorInstance = Monaco.editor.create(div, {
          value: this.getValue(),
          automaticLayout: true,
          ...Object.assign({ language: 'plaintext' }, this.option)
        })
        this.editorInstance.onDidChangeModelContent(() => {
          this.setValue(this.editorInstance.getValue())
        })
        if (this.fieldGroup_) {
          this.fieldGroup_.insertAdjacentElement('afterend', textareaHolder)
          textareaHolder.appendChild(div)
          this._textareaHolder = textareaHolder
          this._textarea = div
          // if (this.sourceBlock_ && this.sourceBlock_.isInFlyout) {
          //   div.disabled = true
          //   div.style.resize = 'none'
          // }
        }
        this.sourceBlock_.outputConnection.x_ -= 16
        this.sourceBlock_.outputConnection.y_ -= 8
      }
      showEditor_() {}
    }

    // Scratch devs forgot to add functionality to change color1, color2, color3
    // for custom fields separately from the category colors, even though
    // it is important feature used by almost all default inputs. Example:
    // https://github.com/LLK/scratch-blocks/blob/bdfeaef0f2021997b85385253604690aa24f299a/blocks_common/math.js#L52-L54
    // const bcfi = runtime._buildCustomFieldInfo.bind(runtime)
    // const bcftfsb = runtime._buildCustomFieldTypeForScratchBlocks.bind(runtime)
    // let fi = null
    // runtime._buildCustomFieldInfo = function (
    //   fieldName,
    //   fieldInfo,
    //   extensionId,
    //   categoryInfo
    // ) {
    //   fi = fieldInfo
    //   return bcfi(fieldName, fieldInfo, extensionId, categoryInfo)
    // }
    // runtime._buildCustomFieldTypeForScratchBlocks = function (
    //   fieldName,
    //   output,
    //   outputShape,
    //   categoryInfo
    // ) {
    //   let res = bcftfsb(fieldName, output, outputShape, categoryInfo)
    //   if (fi) {
    //     if (fi.color1) res.json.colour = fi.color1
    //     if (fi.color2) res.json.colourSecondary = fi.color2
    //     if (fi.color3) res.json.colourTertiary = fi.color3
    //     fi = null
    //   }
    //   return res
    // }

    // https://github.com/LLK/scratch-vm/blob/f405e59d01a8f9c0e3e986fb5276667a8a3c7d40/test/unit/extension_conversion.js#L85-L124
    // https://github.com/LLK/scratch-vm/commit/ceaa3c7857b79459ccd1b14d548528e4511209e7
    // vm.addListener('EXTENSION_FIELD_ADDED', fieldInfo => {
    //   console.log(fieldInfo)
    //   ScratchBlocks.Field.register(fieldInfo.name, fieldInfo.implementation)
    // })
    languages.forEach(language => {
      ScratchBlocks.Field.register(`field_${id}_code_${language}`, {
        fromJson(args) {
          return new FieldCode(args[`code_${language}`], {
            language,
            theme: ReduxStore.getState().scratchGui.theme.theme.gui === 'light' ? 'vs-light' : 'vs-dark',
            fontSize: '18px'
          })
        }
      })
    })
  })

  // @ts-ignore
  const cbfsb = runtime._convertBlockForScratchBlocks.bind(runtime)
  // @ts-ignore
  runtime._convertBlockForScratchBlocks = function (blockInfo, categoryInfo) {
    const res = cbfsb(blockInfo, categoryInfo)
    if (blockInfo.outputShape) {
      res.json.outputShape = blockInfo.outputShape
    }
    return res
  }

  class YourExtension {
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
          languages.map(v => [
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
  // const monacoScript = document.createElement('script')
  // monacoScript.src =
  //   'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs/editor/editor.main.min.js'
  // document.head.appendChild(monacoScript)
  // const monacoCss = document.createElement('link')
  // monacoCss.rel = 'stylesheet'
  // monacoCss.href =
  //   'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs/editor/editor.main.min.css'
  // document.head.appendChild(monacoCss)
  // The following snippet ensures compatibility with Turbowarp / Gandi IDE. If you want to write Turbowarp-only or Gandi-IDE code, please remove corresponding code
  // For Turbowarp
  Scratch.extensions.register(new YourExtension())
})(Scratch)
