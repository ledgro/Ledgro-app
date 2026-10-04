import fs from 'fs';
let content = fs.readFileSync('src/pages/Members.jsx', 'utf-8');

if (!content.includes("catch (_err)")) {
  content = content.replace("toast(\"Admin transferred successfully.\");\n        } catch {", "toast(\"Admin transferred successfully.\");\n        } catch (_err) {");
}

fs.writeFileSync('src/pages/Members.jsx', content);
