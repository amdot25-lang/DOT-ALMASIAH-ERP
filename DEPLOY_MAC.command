#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js غير مثبت. نزله من https://nodejs.org ثم شغل الملف مرة أخرى."
  read -p "اضغط Enter للخروج"
  exit 1
fi
npx firebase-tools --version
npx firebase-tools login
npx firebase-tools use dot-diamond
npx firebase-tools deploy --only firestore:rules,hosting
echo "تم النشر بنجاح: https://dot-diamond.web.app"
read -p "اضغط Enter للإغلاق"
