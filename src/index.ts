import { WebSocketServer } from "ws";
import { inspect } from "util";

import {
  IBoard,
  IGame,
  IRegisterUserResponse,
  IRoom,
  IShipPosition,
  IUser,
  IWin,
  MessageType,
  WS,
} from "./types";
import { parseMessage, sendMessage } from "./utils/ws-helpers";

const users: IUser[] = [];
let userId: number = 0;
let rooms: IRoom[] = [];
let roomId: number = 0;
let games: IGame[] = [];
let gameId: number = 0;
const winners: IWin[] = [];

const wss = new WebSocketServer({ port: 3000 });

wss.on("connection", (ws: WS) => {
  ws.isAlive = true;
  ws.on("error", console.error);
  ws.on("pong", () => heartbeat(ws));

  ws.on("message", (data) => {
    const message = parseMessage(data);
    console.log(JSON.stringify(message));

    try {
      if (message.type === MessageType.reg) {
        const { user, response } = registerUser(message.data as IUser);

        if (!response.error) {
          ws.user = user as IUser;
        }
        sendMessage(ws, MessageType.reg, response);
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

      if (message.type === MessageType.add_ships) {
        const { gameId, ships } = message.data as {
          gameId: number;
          indexPlayer: number;
          ships: IShipPosition[];
        };
        const game = addShips(gameId, ws.user.userId!, ships);

        if (game.boards.length !== 2) {
          // wait for the second player ships
          return;
        }
        wss.clients.forEach((client) => {
          const player = client as WS;
          const playerId = player.user.userId;
          const playerBoard: IBoard | undefined = game.boards.find(
            ({ userId }) => userId === playerId
          );
          if (!playerBoard) {
            return;
          }
          sendMessage(player, MessageType.start_game, {
            ships: playerBoard.ships,
            currentPlayerIndex: playerId,
          });

          if (playerId !== game.gameUserIds[0]) {
            return;
          }
          sendMessage(player, MessageType.turn, {
            currentPlayer: game.gameUserIds[0],
          });
        });
      }
    } catch (error) {
      let errorMessage;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = error;
      }
      console.error(errorMessage);
    }
  });

  ws.on("close", (code, reason) => {
    const userId = ws.user?.userId;
    if (userId === undefined) {
      return;
    }

    clearSession(userId);
  });
});

wss.on("close", function close() {
  clearInterval(interval);
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(client) {
    const ws: WS = client as WS;
    if (ws.isAlive === false) {
      return ws.terminate();
      console.log("Terminate WS");
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 3000);

const heartbeat = (ws: WS) => {
  ws.isAlive = true;
};

const clearSession = (userId: number) => {
  rooms = rooms.filter((r) => !r.roomUsers.some((u) => u.userId === userId));
  games = games.filter((g) => !g.gameUserIds.some((id) => id === userId));
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

  return { response, user: existingUser };
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
  return createGame(user1.userId, user2.userId);
};

const createGame = (userId1: number, userId2: number): IGame => {
  const existingGame = games.find(
    (g) =>
      g.gameUserIds.length === 2 &&
      g.gameUserIds.every((id) => id === userId1 || id === userId2)
  );
  if (existingGame) {
    throw new Error("The game with these two users already exists");
  }

  const game: IGame = {
    gameId: gameId,
    gameUserIds: [userId1, userId2],
    boards: [],
  };
  gameId++;
  games.push(game);
  return game;
};

const addShips = (
  gameId: number,
  userId: number,
  ships: IShipPosition[]
): IGame => {
  const game = games.find(
    (g) =>
      g.gameUserIds.length === 2 && g.gameUserIds.some((id) => id === userId)
  );
  if (!game) {
    throw new Error(`The game ${gameId} with user ${userId} doesn't exist`);
  }
  if (game.boards.length === 2) {
    throw new Error("Both players have provided their ships already");
  }

  const board: IBoard = {
    gameId,
    userId,
    ships: ships.map((pos) => ({ ...pos })),
    attacks: [],
  };
  game.boards.push(board);

  return game;
};
