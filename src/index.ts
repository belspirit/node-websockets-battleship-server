import { WebSocketServer } from "ws";

import {
  IAttackResponse,
  IBoard,
  IGame,
  IRegisterUserResponse,
  IRoom,
  IShip,
  IUser,
  MessageType,
  WS,
} from "./types";
import { parseMessage, sendMessage } from "./utils/ws-helpers";
import state from "./state";

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
        sendMessage(ws, MessageType.update_room, state.rooms);
        sendMessage(ws, MessageType.update_winners, state.winners);
      }

      if (message.type === MessageType.create_room) {
        createRoom(ws.user.name, ws.user.userId!);
        wss.clients.forEach((client) => {
          sendMessage(client as WS, MessageType.update_room, state.rooms);
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
          sendMessage(player, MessageType.create_game, {
            idGame: gameId,
            idPlayer: gameUserIds.find((id) => id !== ws.user.userId!),
          });
          sendMessage(player, MessageType.update_room, state.rooms);
        });
      }

      if (message.type === MessageType.add_ships) {
        const { gameId, ships } = message.data as {
          gameId: number;
          indexPlayer: number;
          ships: IShip[];
        };
        const game = addShips(gameId, ws.user.userId!, ships);

        if (game.boards.length !== 2) {
          // wait for the second player ships
          return;
        }
        wss.clients.forEach((client) => {
          const player = client as WS;
          const playerId = player.user.userId;
          const playerBoard = game.boards.find(
            ({ userId }) => userId === playerId
          );
          if (!playerBoard) {
            return;
          }
          sendMessage(player, MessageType.start_game, {
            ships: playerBoard.ships,
            currentPlayerIndex: ws.user.userId === playerId ? 0 : 1,
          });

          game.turnId = game.gameUserIds[0];
          if (playerId !== game.turnId) {
            return;
          }
          sendMessage(player, MessageType.turn, {
            currentPlayer: playerId,
          });
        });
      }

      if (message.type === MessageType.attack) {
        const currentPlayerId = ws.user.userId;
        const currentPlayerName = ws.user.name;
        const { gameId, x, y, indexPlayer } = message.data as {
          gameId: number;
          x: number;
          y: number;
          indexPlayer: number;
        };
        console.log({
          attacker: currentPlayerName,
          indexPlayer,
          users: state.users,
        });

        const { game, finish, enemyId, attacks } = playersAttack(
          gameId,
          currentPlayerId,
          x,
          y
        );

        wss.clients.forEach((client) => {
          const ws = client as WS;
          if (
            ws.user.userId !== currentPlayerId &&
            ws.user.userId !== enemyId
          ) {
            return;
          }
          attacks.forEach((a) => {
            const attack: IAttackResponse & { currentPlayer: 0 | 1 } = {
              ...a,
              currentPlayer: ws.user.userId === currentPlayerId ? 0 : 1,
            };
            sendMessage(ws, MessageType.attack, attack);
          });
          if (finish) {
            win(currentPlayerName);
            sendMessage(ws, MessageType.finish, {
              winPlayer: ws.user.userId === currentPlayerId ? 0 : 1,
            });
            return;
          }
          console.log({ turnId: game.turnId });

          sendMessage(ws, MessageType.turn, {
            currentPlayer: ws.user.userId === game.turnId ? 0 : 1,
          });
        });
      }

      if (message.type === MessageType.randomAttack) {
        const currentPlayerId = ws.user.userId;
        const currentPlayerName = ws.user.name;
        const { gameId, indexPlayer } = message.data as {
          gameId: number;
          indexPlayer: number;
        };
        const { game, finish, enemyId, attacks } = playersAttack(
          gameId,
          currentPlayerId,
          Math.round(Math.random() * 10),
          Math.round(Math.random() * 10)
        );

        wss.clients.forEach((client) => {
          const ws = client as WS;
          if (
            ws.user.userId !== currentPlayerId &&
            ws.user.userId !== enemyId
          ) {
            return;
          }
          attacks.forEach((a) => {
            const attack: IAttackResponse & { currentPlayer: 0 | 1 } = {
              ...a,
              currentPlayer: ws.user.userId === currentPlayerId ? 0 : 1,
            };
            sendMessage(ws, MessageType.attack, attack);
          });
          if (finish) {
            win(currentPlayerName);
            sendMessage(ws, MessageType.finish, {
              winPlayer: ws.user.userId === currentPlayerId ? 0 : 1,
            });
            sendMessage(ws, MessageType.update_winners, state.winners);
            return;
          }

          sendMessage(ws, MessageType.turn, {
            currentPlayer: ws.user.userId === game.turnId ? 0 : 1,
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
      clearSession;
      ws.terminate();
      const userId = ws.user?.userId;
      if (userId === undefined) {
        return;
      }
      clearSession(userId);
      return;
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 3000);

const heartbeat = (ws: WS) => {
  ws.isAlive = true;
};

const clearSession = (userId: number) => {
  state.rooms = state.rooms.filter(
    (r) => !r.roomUsers.some((u) => u.userId === userId)
  );
  state.games = state.games.filter(
    (g) => !g.gameUserIds.some((id) => id === userId)
  );
};

const registerUser = (user: IUser) => {
  const existingUser = state.users.find((u) => u.name === user.name);
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
    const newUser = { ...user, userId: state.userId++ };
    state.users.push(newUser);
    response.index = newUser.userId;
    return { response, user: newUser };
  }

  return { response, user: existingUser };
};

const createRoom = (userName: string, userId: number): IRoom => {
  const existingRoom = state.rooms.find(
    (r) =>
      r.roomUsers.length === 1 && r.roomUsers.some((u) => u.userId === userId)
  );

  if (existingRoom) {
    throw new Error(
      `Error while trying to create new room for user ${userName}`
    );
  }

  const room = {
    roomId: state.roomId++,
    roomUsers: [{ name: userName, userId }],
  };
  state.rooms.push(room);
  return room;
};

const addUserToRoom = (roomId: number, indexUser: number) => {
  const room = state.rooms.find((r) => r.roomId === roomId);
  if (
    !room ||
    room.roomUsers.length != 1 ||
    room.roomUsers.some((u) => u.userId === indexUser)
  ) {
    throw new Error(
      `Error while trying to add user ${indexUser} to the room ${roomId}`
    );
  }
  const user = state.users.find((u) => u.userId === indexUser);
  if (!user) {
    throw new Error(`User ${indexUser} is not found`);
  }
  const [user1] = room.roomUsers;
  const user2 = user;
  state.rooms = state.rooms.filter((r) => r.roomId !== room.roomId);

  return createGame(user1.userId, user2.userId);
};

const createGame = (userId1: number, userId2: number): IGame => {
  const existingGame = state.games.find(
    (g) =>
      g.gameUserIds.length === 2 &&
      g.gameUserIds.every((id) => id === userId1 || id === userId2)
  );
  if (existingGame) {
    throw new Error("The game with these two users already exists");
  }

  const game: IGame = {
    gameId: state.gameId,
    gameUserIds: [userId1, userId2],
    turnId: userId1,
    boards: [],
  };
  state.gameId++;
  state.games.push(game);
  return game;
};

const addShips = (gameId: number, userId: number, ships: IShip[]): IGame => {
  const game = state.games.find(
    (g) =>
      g.gameUserIds.length === 2 && g.gameUserIds.some((id) => id === userId)
  );
  if (!game) {
    throw new Error(`The game ${gameId} with user ${userId} doesn't exist`);
  }
  if (game.boards.length === 2) {
    throw new Error("Both players have provided their ships already");
  }

  ships.map((s) => {
    s.health = s.length;
    s.killed = false;
  });

  const board: IBoard = {
    gameId,
    userId,
    ships: ships.map((pos) => ({ ...pos })),
    attacks: [],
  };
  game.boards.push(board);

  return game;
};

const playersAttack = (
  gameId: number,
  userId: number,
  x: number,
  y: number
): {
  game: IGame;
  finish: boolean;
  enemyId: number;
  attacks: IAttackResponse[];
} => {
  const game = state.games.find((g) => g.gameId === gameId);
  if (!game) {
    throw new Error(`The game ${gameId} doesn't exist`);
  }
  const board = game.boards.find((b) => b.userId === userId);
  if (!board) {
    throw new Error(`The user ${userId} doesn't exist in the game ${gameId}`);
  }
  if (game.turnId !== userId) {
    throw new Error(
      `The user ${userId} should't attack when turn user ${game.turnId}`
    );
  }
  const enemyBoard = game.boards.find((b) => b.userId !== userId);
  if (!enemyBoard) {
    throw new Error(`The enemy's board doesn't exist in the game ${gameId}`);
  }
  const result: IAttackResponse[] = [];

  const existingAttack = board.attacks.find(
    (a) => a.position.x === x && a.position.y === y
  );
  const ship = enemyBoard.ships.find((s) => {
    const x1 = s.position.x;
    const x2 = x1 + (!s.direction ? s.length - 1 : 0);
    const y1 = s.position.y;
    const y2 = y1 + (s.direction ? s.length - 1 : 0);
    return x1 <= x && x <= x2 && y1 <= y && y <= y2;
  });
  const enemyId = enemyBoard.userId;
  let turn = false;
  let finish = false;
  if (!existingAttack && ship) {
    turn = true;
    ship.health--;
    if (!ship.health) {
      ship.killed = true;
      for (let i = 0; i < ship.length; i++) {
        const x = ship.direction ? ship.position.x : ship.position.x + i;
        const y = !ship.direction ? ship.position.y : ship.position.y + i;
        const attack: IAttackResponse = {
          status: "killed",
          position: { x, y },
        };
        result.push(attack);
      }
      for (let xn = -1; xn < (ship.direction ? 1 : ship.length) + 1; xn++) {
        for (let yn = -1; yn < (!ship.direction ? 1 : ship.length) + 1; yn++) {
          const x = ship.position.x + xn;
          const y = ship.position.y + yn;
          if (x < 0 || x > 9 || y < 0 || y > 9) continue;

          const attack: IAttackResponse = {
            status: "miss",
            position: { x, y },
          };
          result.push(attack);
        }
      }
    } else {
      const attack: IAttackResponse = {
        status: "shot",
        position: { x, y },
      };
      result.push(attack);
    }
    finish = enemyBoard.ships.every((ship) => ship.killed);
    if (finish) {
      state.games = state.games.filter((g) => g.gameId !== gameId);
    }
  } else {
    const attack: IAttackResponse = {
      status: "miss",
      position: { x, y },
    };
    result.push(attack);
  }
  board.attacks.push(...result);
  const turnId = game.gameUserIds.find((id) =>
    turn ? id === userId : id !== userId
  )!;
  game.turnId = turnId;

  return { game, finish, enemyId, attacks: result };
};

const win = (name: string) => {
  let winner = state.winners.find((w) => (w.name = name));
  if (!winner) {
    winner = { name, wins: 0 };
  }
  winner.wins++;
};
