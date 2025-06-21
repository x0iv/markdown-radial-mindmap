import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Reads a script file from the out directory
function getScriptText(scriptPath: string): string {
    const filePath = path.join(__dirname, scriptPath);
    return fs.readFileSync(filePath, 'utf8');
}

// Builds the HTML content for the webview, injecting config and scripts
function getWebviewContent(markdownText: string, config: any) {
    const d3ScriptText = getScriptText('./d3.v6.min.js');
    const forceScriptText = getScriptText('./force.js');
    const escapedMarkdownText = markdownText.replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const configJSON = JSON.stringify(config);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <style>
        body, html { margin: 0; width: 100%; height: 100%; }
        svg { display: block; width: 100%; height: 100%; }
        .node ellipse { cursor: pointer; }
        .node text {
            pointer-events: none;
            user-select: none;
            font-family: ${config.fontFamily};
            font-weight: bold;
        }
        .link { fill: none; stroke: ${config.linkColor}; }
    </style>
</head>
<body>
    <svg></svg>
    <script>
        const vscode = acquireVsCodeApi();
        const initialData = \`${escapedMarkdownText}\`;
        const config = ${configJSON};
    </script>
    <script>
        ${d3ScriptText}
    </script>
    <script>
        ${forceScriptText}
        document.addEventListener('DOMContentLoaded', function() {
            updateMindMap(initialData, config);
        });
        window.addEventListener('message', event => {
            const { type, text } = event.data;
            if (type === 'update') {
                updateMindMap(text, config);
            }
        });
    </script>
</body>
</html>`;
}

// Activates the extension
export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "markdown-radial-mindmap" is now active!');

    let disposable = vscode.commands.registerCommand('markdown-radial-mindmap.viewMindMap', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open a markdown file to see its mind map.');
            return;
        }

        // Read all configuration values
        const cfg = vscode.workspace.getConfiguration('markdownRadialMindMap');
        const config = {
            nodeColor: cfg.get('nodeColor'),
            rootNodeColor: cfg.get('rootNodeColor'),
            linkColor: cfg.get('linkColor'),
            nodeStrokeColor: cfg.get('nodeStrokeColor'),
            fontFamily: cfg.get('fontFamily'),
            rootFontSize: cfg.get('rootFontSize'),
            fontSizeDelta: cfg.get('fontSizeDelta'),
            nodePaddingX: cfg.get('nodePaddingX'),
            nodePaddingY: cfg.get('nodePaddingY'),
        };

        const panel = vscode.window.createWebviewPanel(
            'mindMap',
            'Mind Map View',
            vscode.ViewColumn.Two, 
            { enableScripts: true, retainContextWhenHidden: true }
        );

        // Sends updated content to the webview
        const updateWebviewContent = () => {
            const text = editor.document.getText().replace(/`/g, '\\`').replace(/\$/g, '\\$');
            panel.webview.postMessage({ type: 'update', text: text });
        };

        // Set initial content
        panel.webview.html = getWebviewContent(" - root", config);
        updateWebviewContent();

        // Document change listener
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === editor.document) {
                updateWebviewContent();
            }
        });

        // Editor visibility listener
        const changeEditorSubscription = vscode.window.onDidChangeVisibleTextEditors(editors => {
            if (!editors.includes(editor)) {
                panel.dispose();
            }
        });

        // Cleanup on panel dispose
        panel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            changeEditorSubscription.dispose();
        });

        context.subscriptions.push(panel, changeDocumentSubscription, changeEditorSubscription);
    });

    context.subscriptions.push(disposable);
}

// Deactivates the extension
export function deactivate() {}
