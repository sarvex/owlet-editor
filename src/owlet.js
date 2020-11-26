import $ from "jquery";
import {editor as monacoEditor, KeyCode, KeyMod} from "monaco-editor/esm/vs/editor/editor.api";

import {Emulator} from "./emulator";
import Examples from "./examples.yaml";
import {expandCode} from "./tokens";
import {encode} from 'base2048';
import './owlet-editor.less';

const DefaultProgram = [
    'PRINT "HELLO WORLD"',
    'GOTO 10'
].join('\n');

const TweetMaximum = 280;

function defaultLineNumber(line) {
    return line * 10;
}

export class OwletEditor {
    constructor(optionalInitialProgram) {
        const program = optionalInitialProgram ? optionalInitialProgram : localStorage.getItem("program") || DefaultProgram;
        const editorPane = $('#editor');
        this.editStatus = $('#edit_status');
        this.emuStatus = $('#emu_status');
        this.observer = new ResizeObserver(() => this.editor.layout());
        this.observer.observe(editorPane.parent()[0]);

        monacoEditor.defineTheme('bbcbasicTheme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                {token: 'variable', foreground: 'bb8844'},
                {token: 'number', foreground: '22bb88'}
            ]
        });

        this.editor = monacoEditor.create(editorPane[0], {
            value: program,
            minimap: {
                enabled: false
            },
            lineNumbers: defaultLineNumber,
            language: 'BBCBASIC',
            theme: 'bbcbasicTheme',
            renderWhitespace: "none", // seems to fix odd space/font interaction
            fontSize: 16,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineDecorationsWidth: 0
        });

        this.lineNumberDetect(program);

        this.editor.addAction({
            id: 'execute-basic',
            label: 'Run',
            keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
            keybindingContext: null,
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.5,
            run: async () => await this.updateProgram()
        });

        this.editor.addAction({
            id: 'execute-basic',
            label: 'Expand code',
            keybindings: [KeyMod.CtrlCmd | KeyCode.KEY_E],
            keybindingContext: null,
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.5,
            run: () => this.expandCode()
        });

        this.editor.getModel().onDidChangeContent(() => {
            const basicText = this.getBasicText();
            localStorage.setItem("program", basicText);
            this.lineNumberDetect(basicText);
            this.updateStatus(basicText);
        });

        this.emulator = new Emulator($('#emulator'));
        this.updateStatus(program);

        this.examples = {};
        for (const example of Examples.examples)
            this.addExample(example);
    }

    async chooseExample(id) {
        const example = this.examples[id];
        if (example.basic) {
            this.updateEditorText(example.basic, "load example");
            await this.updateProgram();
        }
    }

    updateEditorText(newText, updateType) {
        if (updateType) {
            this.editor.pushUndoStop();
            const previousSelections = this.editor.getSelections();
            this.editor.executeEdits(
                updateType,
                [{
                    range: this.editor.getModel().getFullModelRange(),
                    text: newText
                }],
                previousSelections);
            this.editor.pushUndoStop();
        } else {
            this.editor.getModel().setValue(newText);
        }
    }

    addExample(example) {
        this.examples[example.id] = example;
        const $examples = $('#examples');
        const newElem =
            $examples.find("div.template")
                .clone()
                .removeClass("template")
                .appendTo($examples);
        newElem.find(".name")
            .text(example.name)
            .click(() => this.chooseExample(example.id));
        newElem.find(".description").text(example.description);
        if (example.basic)
            newElem.find(".code").text(example.basic);
    }

    toStateString() {
        const state = {v: 1, program: this.getBasicText()};
        return encodeURIComponent(JSON.stringify(state));
    }

    lineNumberDetect(text) {
        if (/^\s*\d+/.test(text)) {
            this.editor.updateOptions({lineNumbers: "off"});
        } else {
            this.editor.updateOptions({lineNumbers: defaultLineNumber});
        }
    }

    getBasicText() {
        return this.editor.getModel().getValue();
    }

    async updateProgram() {
        try {
            await this.emulator.runProgram(this.getBasicText());
        } catch (e) {
            // TODO a pop up or similar? See #14
            // Reproducible if you paste a too-long line into the
            // editor; we get "Unable to tokenize".
            console.log(`Unable to run program: ${e}`);
        }
    }

    updateStatus(basicText) {

      let base2048encoded = encode(basicText.split("").map(c => c.charCodeAt(0)));
      let message = (basicText.length>280) ? basicText.length+' plaintext | '+base2048encoded.length+' base2048' : basicText.length;

        this.editStatus
            .find(".count")
            .text(message)
            .toggleClass("too_long", base2048encoded.length > TweetMaximum);

        this.emuStatus.text("BBC Micro Model B | GXR ROM");
    }

    selectView(selected) {
        for (const element of ['screen', 'about', 'examples']) {
            $(`#${element}`).toggle(element === selected);
        }
        if (selected === 'screen')
            this.emulator.start();
        else
            this.emulator.pause();
    }

    share() {
        const shareModal = document.getElementById("share");
        shareModal.style.display = "block";
    }

    expandCode() {
        this.updateEditorText(expandCode(this.getBasicText()), "expand code");
    }

    async initialise() {
        await this.emulator.initialise();
        await this.updateProgram();
        const actions = {
            run: async () => {
                await this.updateProgram();
                this.selectView('screen');
            },
            examples: () => this.selectView('examples'),
            jsbeeb: () => window.open(`https://bbc.godbolt.org/?embedBasic=${encodeURIComponent(this.getBasicText())}&rom=gxr.rom`, "_blank"),
            tweet: () => this.share(),
            emulator: () => this.selectView('screen'),
            about: () => this.selectView('about'),
            expand: () => this.expandCode()
        };
        $("button[data-action]").click(e => actions[e.target.dataset.action]());
    }
}
