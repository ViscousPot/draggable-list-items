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
    // div.innerText = "👉";

    div.ondrop = (ev: DragEvent) => {
      ev.preventDefault();

      const from = parseInt(ev.dataTransfer?.getData("from") as string)
      const to = parseInt(ev.dataTransfer?.getData("to") as string)
      // console.log(dragId)
      // const el = document.getElementById(data)?.parentElement.
      
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

      // const transaction2 = view.state.update({
      //   changes: {
      //     from: from,
      //     to: to,                  
      //     insert: ""
      //   }
      // });
      
      
      // Apply the transaction to the editor
      view.dispatch(transaction);
      // view.dispatch(transaction2);
      // const data = ev.dataTransfer?.getData("text");
      // ev.target?.appendChild(document.getElementById(data));
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

	onunload() {

	}
}


class DraggableListItems implements PluginValue {
  decorations: DecorationSet;
  // attachedListeners: ;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
    // console.log("updates galore")
  }

  destroy() {}

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    // const listItems = document.getElementsByClassName("HyperMD-list-line-1 cm-line")

    // if (listItems.length < 1) {
    //   view.requestMeasure()
    //   return builder.finish();
    // }
    
    // for (let i = 0; i < listItems.length; i++) {//i < 1; i++) {
    //   const item = listItems[i]

    //   item.setText("testtest")
    //   item.setAttribute("draggable", "true")
      
    //   builder.add(
    //     listCharFrom,
    //     listCharFrom + 1,
    //     Decoration.mark({
    //       attributes: {
    //         draggable: "true"
    //       }
    //     })
    //   );
    //   // console.log(item.textContent)
    // }
    

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter(node) {
          console.log(node.type.name)
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
      // ev.dataTransfer?.setData("dragId", el.id);

      // const rawText = view.state.sliceDoc(parseInt(el.getAttribute("aria-from") ?? ""), parseInt(el.getAttribute("aria-to") ?? ""))
      ev.dataTransfer?.setData("from", el.getAttribute("aria-from") ?? "");
      ev.dataTransfer?.setData("to", el.getAttribute("aria-to") ?? "");
    }
  }
};

export const draggableListItems = ViewPlugin.fromClass(
  DraggableListItems,
  pluginSpec
);
