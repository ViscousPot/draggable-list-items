import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from "@codemirror/view";

import { Plugin } from 'obsidian';
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

export class EmojiWidget extends WidgetType {
  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("span");

    div.innerText = "👉";

    return div;
  }
}

export class DropWidget extends WidgetType {
  from = 0
  to = 0
  
  setFromTo(from: number, to: number) {
    this.from = from
    this.to = to
  }
  toDOM(view: EditorView): HTMLElement {
    const div = document.createElement("span");

    div.style.position = "absolute"
    div.style.top = "90%"
    div.style.right = "0"
    div.style.left = "0"
    div.style.width = "100%"
    div.style.height = "10px"
    div.style.background = "#00000000"
    div.style.borderTop = "dashed #55555555"
    div.style.opacity = "0"
    div.style.zIndex = "2"

    div.ondrop = (ev: DragEvent) => {
      ev.preventDefault();

      const from = parseInt(ev.dataTransfer?.getData("from") as string)
      const to = parseInt(ev.dataTransfer?.getData("to") as string)
      
      const transaction = view.state.update(
        {
          changes: {
            from: this.to,
            to: this.to + 1,                  
            insert: 
            `
${view.state.sliceDoc(from, to)}
`               
          }
        },
        {
          changes: {
            from: from,
            to: to,                  
            insert: ""
          }
        }
      );

      view.dispatch(transaction);
    }

    div.ondragover = (ev: DragEvent) => {
      ev.preventDefault()
    }

    div.ondragenter = (ev: DragEvent) => {
      ev.preventDefault()
      const el = (ev.target as HTMLElement)
      el.style.opacity = "1"
    }

    div.ondragleave = (ev: DragEvent) => {
      ev.preventDefault()
      const el = (ev.target as HTMLElement)
      el.style.opacity = "0"
    }

    return div;
  }
}

export default class MyPlugin extends Plugin {

	async onload() {
    this.registerEditorExtension([draggableListItems]);
	}

	onunload() {	}
}


class DraggableListItems implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy() {}

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter(node) {
          if (node.type.name.startsWith("list")) {
            let from = node.from

            switch (view.state.sliceDoc(node.from - 2, node.from)) {
              case "* ": 
              case "- ": {
                from -= 2
                break
              }
              case " ]": {
                from -= 5
                break
              }
            }

            builder.add(
              node.from,
              node.to - 1,
              Decoration.mark({
                attributes: {
                  draggable: "true",
                  id: from.toString(),
                  "aria-from": (from).toString(),
                  "aria-to": (node.to).toString(),
                }
              })
            );

            const dropWidget = new DropWidget()
            dropWidget.setFromTo(node.from, node.to)
            
            builder.add(
              node.to - 1,
              node.to,
              Decoration.widget({
                widget: dropWidget
              })
            );
          }
        },
      });
    }

    return builder.finish();
  }
}

const pluginSpec: PluginSpec<DraggableListItems> = {
  decorations: (value: DraggableListItems) => value.decorations,
  eventHandlers: {
    dragstart: (ev, view) => {
      const el = ev.target as HTMLElement

      ev.dataTransfer?.setData("from", el.getAttribute("aria-from") ?? "");
      ev.dataTransfer?.setData("to", el.getAttribute("aria-to") ?? "");
    }
  }
};

export const draggableListItems = ViewPlugin.fromClass(
  DraggableListItems,
  pluginSpec
);
