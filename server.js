// ----------------- Imports -----------------
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import http from "http";

dotenv.config();

// ----------------- Setup -----------------
const app = express();
const server = http.createServer(app);

// ✅ Use dynamic CORS (Vercel + Localhost)
const allowedOrigins = [
  "http://localhost:5173",
  "https://game1-frontend.vercel.app",
];


const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT"],
  },
});

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT"],
  })
);

app.use(express.json());

// ----------------- MongoDB Setup -----------------
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ----------------- Schemas -----------------
const gameSchema = new mongoose.Schema({
  title: String,
  sport: String,
  time: String,
  location: String,
  players: { type: Number, default: 0 },
  maxPlayers: { type: Number, default: 6 },
  createdAt: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema({
  title: String,
  caption: String,
  image: String,
  author: {
    id: String,
    name: String,
  },
  createdAt: { type: Date, default: Date.now },
});

const messageSchema = new mongoose.Schema({
  room: String,
  author: {
    id: String,
    name: String,
  },
  text: String,
  createdAt: { type: Date, default: Date.now },
});

// ----------------- Models -----------------
const Game = mongoose.model("Game", gameSchema);
const Post = mongoose.model("Post", postSchema);
const Message = mongoose.model("Message", messageSchema);

// ----------------- REST APIs -----------------

// 👉 Get all games
app.get("/api/games", async (req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 });
    res.json(games);
  } catch (err) {
    res.status(500).json({ message: "Error fetching games" });
  }
});

// 👉 Create a new game
app.post("/api/games", async (req, res) => {
  try {
    const { title, sport, time, players, location } = req.body;

    const newGame = new Game({
      title,
      sport,
      time,
      location,
      players: Number(players) || 0,
      maxPlayers: 6,
    });

    await newGame.save();
    res.json(newGame);
  } catch (err) {
    res.status(500).json({ message: "Error creating game" });
  }
});

// 👉 Join a game
app.put("/api/games/:id/join", async (req, res) => {
  try {
    const { id } = req.params;
    const game = await Game.findById(id);
    if (!game) return res.status(404).json({ message: "Game not found" });
    if (game.players >= game.maxPlayers)
      return res.status(400).json({ message: "Game is full" });

    game.players += 1;
    await game.save();
    io.emit("update_game", game);
    res.json(game);
  } catch (err) {
    res.status(500).json({ message: "Error joining game" });
  }
});

// 👉 Get all posts
app.get("/api/posts", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Error fetching posts" });
  }
});

// 👉 Create a new post
app.post("/api/posts", async (req, res) => {
  try {
    const newPost = new Post(req.body);
    await newPost.save();
    res.json(newPost);
  } catch (err) {
    res.status(500).json({ message: "Error creating post" });
  }
});

// ----------------- Socket.io Chat -----------------
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("join_room", async (room) => {
    if (!room) return;
    socket.join(room);
    console.log(`👥 ${socket.id} joined room: ${room}`);

    try {
      const messages = await Message.find({ room }).sort({ createdAt: 1 }).limit(50);
      socket.emit("load_messages", messages);
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  });

  socket.on("leave_room", (room) => {
    socket.leave(room);
    console.log(`🚪 ${socket.id} left room: ${room}`);
  });

  socket.on("chat_message", async (msg) => {
    try {
      if (!msg?.room) return;
      const newMsg = new Message(msg);
      await newMsg.save();
      io.to(msg.room).emit("chat_message", newMsg);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
  });
});

// ----------------- Start Server -----------------
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => console.log(`🚀 Server running locally on http://localhost:${PORT}`));
}

export default app; // ✅ Required for Vercel
