/**
 * Android Chrome で capture="environment" を確実に動作させるため、
 * DOM を直接操作して input[capture] を生成・クリックする。
 */
export function openCamera(onFiles: (files: File[]) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    if (files.length) onFiles(files);
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}
