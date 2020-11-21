import $ from 'jquery';
import {editor as monacoEditor, KeyCode, KeyMod} from 'monaco-editor';
import {registerBbcBasicLanguage} from './bbcbasic';
import {Emulator} from './emulator';
import rootHtml from './root.html';
import Examples from './examples.yaml';
import Tokens from './tokens';

import './owlet-editor.less';

const DefaultProgram = [
    'PRINT "HELLO WORLD"',
    'GOTO 10'
].join('\n');

const StateVersion = 1;
const TweetMaximum = 280;

class OwletEditor {
    constructor() {
        const state = OwletEditor.decodeStateString(window.location.hash.substr(1));
        const program = state ? state.program : localStorage.getItem("program") || DefaultProgram;
        const editorPane = $('#editor');
        this.editStatus = $('#edit_status');
        this.emuStatus = $('#emu_status');
        this.observer = new ResizeObserver(() => this.editor.layout());
        this.observer.observe(editorPane.parent()[0]);
        this.editor = monacoEditor.create(editorPane[0], {
            value: program,
            minimap: {
                enabled: false
            },
            lineNumbers: l => l * 10,
            language: 'BBCBASIC',
            theme: 'vs-dark',
            renderWhitespace: "none", // seems to fix odd space/font interaction
            fontSize: 16,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineDecorationsWidth: 0
        });

        this.editor.addAction({
            id: 'execute-basic',
            label: 'Run',
            keybindings: [KeyMod.CtrlCmd | KeyCode.Enter],
            keybindingContext: null,
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1.5,
            run: async () => await this.emulator.runProgram(this.editor.getModel().getValue()),
        });

        this.editor.getModel().onDidChangeContent(() => {
            const basicText = this.getBasicText();
            localStorage.setItem("program", basicText);
            //history.replaceState(null, '', `#${this.toStateString()}`);
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
            this.editor.getModel().setValue(example.basic);
            await this.updateProgram();
            //this.selectView('screen')
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

    getBasicText() {
        return this.editor.getModel().getValue();
    }

    toStateString() {
        const state = {v: StateVersion, program: this.getBasicText()};
        return encodeURIComponent(JSON.stringify(state));
    }

    static decodeStateString(stateString) {
        try {
            const state = JSON.parse(decodeURIComponent(stateString));
            if (state.v !== StateVersion)
                return null;
            return state;
        } catch (e) {
            return null;
        }
    }

    async onHashChange() {
        const state = OwletEditor.decodeStateString(window.location.hash.substr(1));
        if (state) {
            this.editor.getModel().setValue(state.program);
            await this.updateProgram();
            this.selectView('screen')
        }
    }

    async updateProgram() {
        await this.emulator.runProgram(this.getBasicText());
    }

    detokenize(text) {
        let output = "";
        let instr = false;
        for (let i = 0; i < text.length; i++) {
            const g = text.codePointAt(i) & 0xff;
            if (g === 0x22) {
                // we're a string
                instr = !instr;
            }
            if (g === 0x10 || g === 0x3A) {
                instr = false
            }
            output += (g >= 0x80 && !instr) ? Tokens.tokens[g - 0x81] : text[i];
        }
        return output;
    }

    updateStatus(basicText) {
        this.editStatus
            .find(".count")
            .text(basicText.length)
            .toggleClass("too_long", basicText.length >= TweetMaximum);
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
        //window.open(`https://twitter.com/intent/tweet?screen_name=BBCmicroBot&text=${encodeURIComponent(this.getBasicText())}`, '_new'),
        const shareModal = document.getElementById("share");
        shareModal.style.display = "block";
    }

    async initialise() {
        await this.emulator.initialise();
        await this.updateProgram();
        const actions = {
            run: async () => {
                await this.updateProgram();
                this.selectView('screen')
            },
            examples: () => this.selectView('examples'),
            jsbeeb: () => window.open(`https://bbc.godbolt.org/?embedBasic=${encodeURIComponent(this.getBasicText())}&rom=gxr.rom`, "_blank"),
            tweet: () => this.share(),
            emulator: () => this.selectView('screen'),
            about: () => this.selectView('about'),
            detokenize: () => this.editor.getModel().setValue(this.detokenize(this.getBasicText()))
        };
        $(".toolbar button").click(e => actions[e.target.dataset.action]());
    }
}

async function initialise() {
    $('body').append(rootHtml);
    registerBbcBasicLanguage();

    // Check if we reference a cached tweet on first load and convert it to URL hash
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const load = urlParams.get('load')
    if (load !== null) {
        const response = await fetch("../assets/programs/" + load);
        const basicText = await response.text();
        console.log(response.status, response)
        let program = (response.status === 200) ? basicText : "REM BBC BASIC program " + load + " not found\n";
        //history.replaceState(null, '', `#${encodeURIComponent(JSON.stringify({v: StateVersion, program: program}))}`);
        localStorage.setItem("program", program);
    }

    const owletEditor = new OwletEditor();
    await owletEditor.initialise();

    owletEditor.LineNumbers = false;
    window.onhashchange = () => owletEditor.onHashChange();

    function setTheme(themeName) {
        localStorage.setItem('theme', themeName);
        document.documentElement.className = themeName;
    }

    setTheme("theme-classic");

    // 'Share' pop-up
    const modal = document.getElementById("share");
    const span = document.getElementsByClassName("close")[0];
    span.onclick = function () {
        modal.style.display = "none";
    }
    window.onclick = function (event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    }

}

initialise().then(() => {
    console.log("Ready to go");
});
