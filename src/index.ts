import { WebSocketServer } from "ws";

import {
  IGame,
  IRegisterUserResponse,
  IRoom,
  IUser,
  IWin,
  MessageType,
  WS,
} from "./types";
import { parseMessage, sendMessage } from "./utils/ws-helpers";

const users: IUser[] = [];
let userId: number = 0;
const rooms: IRoom[] = [];
let roomId: number = 0;
const games: IGame[] = [];
let gameId: number = 0;
const winners: IWin[] = [];

const wss = new WebSocketServer({ port: 3000 });

wss.on("connection", (ws: WS) => {
  ws.isAlive = true;
  ws.on("error", console.error);
  ws.on("pong", () => heartbeat(ws));

  ws.on("message", (data) => {
    const message = parseMessage(data);
    console.log(message);

    try {
      if (message.type === MessageType.reg) {
        const { user, response } = registerUser(message.data as IUser);

        if (!response.error) {
          ws.user = user as IUser;
        }
        sendMessage(ws, MessageType.reg, user);
        sendMessage(ws, MessageType.update_room, rooms);
        sendMessage(ws, MessageType.update_winners, winners);
      }

      if (message.type === MessageType.create_room) {
        createRoom(ws.user.name, ws.user.userId!);
        wss.clients.forEach((client) => {
          sendMessage(client as WS, MessageType.update_room, rooms);
        });
      }

      if (message.type === MessageType.add_user_to_room) {
        const { indexRoom } = message.data as { indexRoom: number };
        const { gameId, gameUserIds } = addUserToRoom(
          indexRoom,
          ws.user.userId!
        );

        wss.clients.forEach((client) => {
          const player = client as WS;
          if (!gameUserIds.some((id) => id === player.user.userId)) {
            return;
          }
          sendMessage(client as WS, MessageType.create_game, {
            idGame: gameId,
            idPlayer: gameUserIds.find((id) => id !== ws.user.userId!),
          });
        });
      }
    } catch (error) {
      console.error(error);
    }
  });
});

wss.on("close", function close() {
  clearInterval(interval);
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws: any) {
    if (ws.isAlive === false) {
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 3000);

const heartbeat = (ws: WS) => {
  ws.isAlive = true;
};

const registerUser = (user: IUser) => {
  const existingUser = users.find((u) => u.name === user.name);
  const response: IRegisterUserResponse = {
    name: user.name,
    index: -1,
    error: false,
    errorText: "",
  };

  if (existingUser) {
    if (existingUser.password === user.password) {
      response.index = existingUser.userId ?? -1;
    } else {
      response.error = true;
      response.errorText = "Wrong password";
    }
  } else {
    const newUser = { ...user, userId: userId++ };
    users.push(newUser);
    response.index = newUser.userId;
    return { response, user: newUser };
  }

  return { response };
};

const createRoom = (userName: string, userId: number) => {
  const existingRoom = rooms.find(
    (r) =>
      r.roomUsers.length === 1 && r.roomUsers.some((u) => u.userId === userId)
  );

  if (existingRoom) {
    throw new Error(
      `Error while trying to create new room for user ${userName}`
    );
  }

  const room = {
    roomId: roomId++,
    roomUsers: [{ name: userName, userId }],
  };
  rooms.push(room);
};

const addUserToRoom = (roomId: number, indexUser: number) => {
  const room = rooms.find((r) => r.roomId === roomId);
  if (
    !room ||
    room.roomUsers.length != 1 ||
    room.roomUsers.some((u) => u.userId === indexUser)
  ) {
    throw new Error(
      `Error while trying to add user ${indexUser} to the room ${roomId}`
    );
  }
  const user = users.find((u) => u.userId === indexUser);
  if (user) {
    room.roomUsers.push({ name: user.name, userId: user.userId });
  }
  const [user1, user2] = room.roomUsers;
  return createGame(user1.userId!, user2.userId!);
};

const createGame = (userId1: number, userId2: number) => {
  const existingGame = games.find(
    (g) =>
      g.gameUserIds.length === 2 &&
      g.gameUserIds.every((id) => id === userId1 || id === userId2)
  );
  if (existingGame) {
    throw new Error("The game with these two users already exists");
  }

  const game = { gameId: gameId++, gameUserIds: [userId1, userId2] };
  games.push(game);
  return game;
};
