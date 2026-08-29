function collectVariableNames(template: string): Set<string> {
  const matches = template.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
  const names = new Set<string>();
  for (const match of matches) {
    const variableName = match[1];
    if (variableName) {
      names.add(variableName);
    }
  }
  return names;
}

export class PromptRenderer {
  render(template: string, variables: Record<string, string>): string {
    const missingVariables = [...collectVariableNames(template)].filter((name) => variables[name] === undefined);

    if (missingVariables.length > 0) {
      throw new Error(`Fehlende Prompt-Variablen: ${missingVariables.join(', ')}`);
    }

    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, variableName: string) => {
      return variables[variableName] ?? '';
    });
  }
}

export const promptRenderer = new PromptRenderer();
