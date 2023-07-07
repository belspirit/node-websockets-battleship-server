import { RawData, WebSocketServer } from "ws";

import {
  IGame,
  IRegResponseData,
  IRequestMessage,
  IResponseMessage,
  IRoom,
  IUser,
  MessageType,
  WS,
} from "./types";

const users: IUser[] = [];
const rooms: IRoom[] = [];
const games: IGame[] = [];

const wss = new WebSocketServer({ port: 3000 });

const sendMessage = <T>(ws: WS, message: IResponseMessage<T>) => {
  const strMessage: string = JSON.stringify({
    ...message,
    data: JSON.stringify(message.data) as T,
  });
  ws.send(strMessage);
};

const parseMessage = <T>(data: RawData): IResponseMessage<T> => {
  const message = JSON.parse(data.toString()) as IRequestMessage;
  return { ...message, data: message.data ? JSON.parse(message.data) : "" };
};

wss.on("connection", (ws: WS) => {
  ws.isAlive = true;
  ws.on("error", console.error);
  ws.on("pong", heartbeat);

  ws.on("message", (data) => {
    const jsonData = parseMessage<IUser>(data);
    console.log(jsonData);
    if (jsonData.type === MessageType.reg) {
      const user = jsonData.data;
      if (user.name === "sergey") {
        sendMessage<IRegResponseData>(ws, {
          type: MessageType.reg,
          data: {
            name: user.name,
            index: 123,
            error: false,
            errorText: undefined,
          },
          id: 0,
        });
      }
    }

    if (jsonData.type === MessageType.create_room) {
      sendMessage(ws, {
        type: MessageType.update_room,
        data: [
          {
            roomId: 0,
            roomUsers: [
              {
                name: "sergey",
                index: 0,
              },
            ],
          },
        ],
        id: 0,
      });
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

function heartbeat(this: any) {
  this.isAlive = true;
}
