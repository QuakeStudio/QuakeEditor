import { Runtime } from 'scratch-vm'

export class MonacoEditor {
  scratch: typeof globalThis.Scratch
  monaco: any
  glslConfig: {
    conf: Object
    language: Object
  }
  extConfig: {
    id: String
  }
  runtime: Runtime
  languages: any

  constructor(Scratch) {
    this.scratch = Scratch
    this.runtime = Scratch.vm.runtime

    this.monaco
    this.glslConfig
    this.extConfig
    this.languages
  }

  async init() {
    this.monaco = await import(
      //@ts-ignore
      'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/+esm'
    )
    this.glslConfig = await import('./glslSyntaxHighlighting')
    this.extConfig = await import('../config')

    this.addGlslLanguage()
    this.implementMonacoEditor()
  }

  addGlslLanguage() {
    this.monaco.languages.register({ id: 'glsl' });
    this.monaco.languages.setLanguageConfiguration('glsl', this.glslConfig.conf);
    this.monaco.languages.setMonarchTokensProvider('glsl', this.glslConfig.language);
  }

  implementMonacoEditor() {
    this.languages = this.monaco.languages.getLanguages().map(v => v.id)
    this.scratch.gui.getBlockly().then(async ScratchBlocks => {
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
      //@ts-ignore
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

      const monaco = this.monaco
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
          ScratchBlocks.Field.prototype.init.call(this, ...initArgs) //this thing kept on giving errors and idk how to stop it, the code still works tho
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
          this.editorInstance = monaco.editor.create(div, {
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
      this.languages.forEach(language => {
        ScratchBlocks.Field.register(`field_${this.extConfig.id}_code_${language}`, {
          fromJson(args) {
            return new FieldCode(args[`code_${language}`], {
              language,
              //@ts-ignore
              theme: ReduxStore.getState().scratchGui.theme.theme.gui === 'light' ? 'vs-light' : 'vs-dark',
              fontSize: '18px'
            })
          }
        })
      })
    })
  
    //@ts-ignore
    const cbfsb = this.runtime._convertBlockForScratchBlocks.bind(this.runtime)
    //@ts-ignore
    this.runtime._convertBlockForScratchBlocks = function (blockInfo, categoryInfo) {
      const res = cbfsb(blockInfo, categoryInfo)
      if (blockInfo.outputShape) {
        res.json.outputShape = blockInfo.outputShape
      }
      return res
    }
  }
}