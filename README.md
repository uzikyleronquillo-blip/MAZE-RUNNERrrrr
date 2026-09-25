# 🐱 CAT DASH: CAREER MAZE CHALLENGE

A classroom-ready real-time multiplayer career quiz maze for **5 teams**. Students join from phones; the teacher projects the main game screen.

## Features
- 5-player/team real-time Socket.IO game
- QR join URL generated from the current deployment host
- 40 career questions: Common, Uncommon, Creative, Technical
- 10-second rounds, 12 rounds per game
- Speed scoring: +5 first correct, +3 second, +2 third, otherwise 0
- Animated cat movement, scoreboard, results, final champion screen
- Responsive student phone interface
- Render-compatible server
- No database or paid service required

## Run locally
```bash
npm install
npm start
```
Open `http://localhost:3000` on the teacher computer. For phones on the same Wi-Fi, use the computer's LAN address instead of localhost (for example `http://192.168.x.x:3000`).

## GitHub
1. Create a new GitHub repository.
2. Upload the contents of this folder, including `package.json`, `server.js`, and `public/`.
3. Commit the files.

## Render
Create a **Web Service**, connect the GitHub repository, and use:

Build command:
```bash
npm install
```

Start command:
```bash
npm start
```

The server uses `process.env.PORT || 3000` and listens on `0.0.0.0`, so it is compatible with Render.

After deployment, open the Render URL. The teacher lobby requests `/api/join-url`, which generates a QR code pointing to the deployed `/player.html` page rather than hard-coding localhost.

## Classroom flow
1. Teacher opens the site and clicks **Create Game**.
2. Display the QR code on the projector.
3. Five students scan it, enter team names, and choose cats.
4. Teacher starts when all 5 are ready.
5. Students answer on phones; the teacher screen shows cats moving toward A/B/C doors.
6. Scores update after each round.
7. After 12 rounds, the final scoreboard appears.

## Important implementation note
The authoritative answer key and scoring are kept on the Node.js server. The current client question deck is shared as a static teaching resource and the server receives the current correct index from the teacher session. For a production-grade anti-cheat implementation, move the full question deck and question selection into `server.js` and send only question text/options for each active round to clients.
