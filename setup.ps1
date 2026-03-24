git init
New-Item -ItemType Directory -Force -Path server
Set-Location server
npm init -y
npm install express socket.io sqlite3 cors
Set-Location ..
npx -y create-vite@latest client --template react
Set-Location client
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
