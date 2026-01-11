const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// pliki z public
app.use(express.static(path.join(__dirname, '../public')));

// start serwera
app.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});