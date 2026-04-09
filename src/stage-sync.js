const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const output = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        output.push(fullPath);
      }
    });
  }

  return output;
}

function copyWithStructure(sourceRoot, destinationRoot, filter) {
  const files = walkFiles(sourceRoot);
  let copied = 0;

  files.forEach((filePath) => {
    const relativePath = path.relative(sourceRoot, filePath);
    if (filter && !filter(relativePath)) {
      return;
    }

    const targetPath = path.join(destinationRoot, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(filePath, targetPath);
    copied += 1;
  });

  return copied;
}

function findFirstStage(workspace) {
  const stages = workspace?.stages || [];
  return stages.length ? stages[0] : null;
}

function injectDecompiledSources(workspace, decompiledDir) {
  const firstStage = findFirstStage(workspace);
  if (!firstStage) {
    throw new Error("Aucun stage disponible pour injecter les sources décompilées.");
  }

  if (!fs.existsSync(decompiledDir)) {
    throw new Error("Le dossier de sources décompilées n'existe pas.");
  }

  const importedJavaDir = path.join(firstStage.path, "src", "imported", "java");
  const importedResourcesDir = path.join(firstStage.path, "src", "imported", "resources");
  const notesDir = path.join(firstStage.path, "notes");
  ensureDir(importedJavaDir);
  ensureDir(importedResourcesDir);
  ensureDir(notesDir);

  const javaCount = copyWithStructure(decompiledDir, importedJavaDir, (relativePath) => relativePath.endsWith(".java"));
  const resourceCount = copyWithStructure(
    decompiledDir,
    importedResourcesDir,
    (relativePath) => !relativePath.endsWith(".java")
  );

  const manifest = {
    source: decompiledDir,
    importedAt: new Date().toISOString(),
    javaCount,
    resourceCount,
    targetStage: firstStage.path
  };

  fs.writeFileSync(path.join(notesDir, "decompiled-import.json"), JSON.stringify(manifest, null, 2), "utf8");

  return {
    stagePath: firstStage.path,
    importedJavaDir,
    importedResourcesDir,
    javaCount,
    resourceCount
  };
}

module.exports = {
  injectDecompiledSources
};
