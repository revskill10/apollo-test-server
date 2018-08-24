import 'dotenv/config';
import http from 'http';

import cors from 'cors';
import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import gql from 'graphql-tag'
import uuidv4 from 'uuid/v4';
import pubsub, { EVENTS } from './subscription';

let users = {
  1: {
    id: '1',
    username: 'Robin Wieruch',
    messageIds: [1]
  },
  2: {
    id: '2',
    username: 'Dave Davids',
    messageIds: [2]
  },
};

let messages = {
  1: {
    id: '1',
    text: 'Hello World',
    userId: '1',
  },
  2: {
    id: '2',
    text: 'By World',
    userId: '2',
  },
};

let me = users[1];

const app = express();
app.use(cors());

const schema = gql`
  type Query {
    me: User
    user(id: ID!): User
    users: [User!]

    messages: [Message!]!
    message(id: ID!): Message!
  }

  type User {
    id: ID!
    username: String!
    messages: [Message!]
  }

  type Message {
    id: ID!
    text: String!
    user: User!
  }

  type Mutation {
    createMessage(text: String!): Message!
    deleteMessage(id: ID!): Boolean!
  }

  type MessageCreated {
    message: Message!
  }

  type Subscription {
    messageCreated: MessageCreated!
  }
`;

const resolvers = {
  Query: {
    me: (_parent, _args, { me }) => {
      return me;
    },
    user: (_parent, { id }) => {
      return users[id]
    },
    users: () => {
      return Object.values(users);
    },
    messages: () => {
      return Object.values(messages);
    },
    message: (_parent, { id }) => {
      return messages[id];
    },
  },
  User: {
    messages: user => {
      return Object.values(messages).filter(
        message => message.userId === user.id,
      );
    },
  },
  Message: {
    user: message => {
      return users[message.userId]
    }
  },
  Mutation: {
    createMessage: (_parent, { text }, { me }) => {
      const id = uuidv4();
      const message = {
        id,
        text,
        userId: me.id,
      };
      users[me.id].messageIds.push(id);
      pubsub.publish(EVENTS.MESSAGE.CREATED, {
        messageCreated: { message },
      });
      return message;
    },
    deleteMessage: (_parent, { id }) => {
      const { [id]: message, ...otherMessages } = messages;

      if (!message) {
        return false;
      }

      messages = otherMessages;

      return true;
    },
  },
  Subscription: {
    messageCreated: {
      subscribe: () => {                
        pubsub.publish(EVENTS.MESSAGE.CREATED, {
          messageCreated: { message: messages[1] },
        });
        return pubsub.asyncIterator(EVENTS.MESSAGE.CREATED);
      },
    },
  },
};

const server = new ApolloServer({
  typeDefs: schema,
  resolvers,
  context: async ({ req, connection }) => {
    if (connection) {
      return {
        me,
      };
    }

    if (req) {
      return {
        me,
      };
    }
  },
});

server.applyMiddleware({ app, path: '/graphql' });
const httpServer = http.createServer(app);
server.installSubscriptionHandlers(httpServer);
httpServer.listen({ port: 8000 }, () => {
  console.log(process.env.MY_DATABASE_PASSWORD);
  console.log('Apollo Server on http://localhost:8000/graphql');
});