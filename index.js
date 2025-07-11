import express from 'express'
import { Server } from "socket.io" 
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PORT = process.env.PORT || 3500
const ADMIN = "Admin"
const app = express()

app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT, ()=>{
  console.log(`listening on port ${PORT}`)
})

//state
const UserState = {
  users:[],
  setUsers: function(newUsersArray){
    this.users = newUsersArray
  }

}

const io = new Server(expressServer, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : 
        ["http://localhost:5500","http://127.0.0.1:5500"]
    }
})

io.on("connection", (socket) => {
  console.log(`User ${socket.id} connected`);

  // Upon connection -> only to User
  socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App"));

  socket.on('enterRoom' , ({ name, room}) => {
    //leave a previous room, if the user was in one
    const prevRoom = getUser(socket.id)?.room

    if(prevRoom){
      socket.leave(prevRoom)
      io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`));
    }
    const user = activateUser(socket.id, name, room)
    // Cannot update previous room users list until after the state update in active user.
    if(prevRoom){
      io.to(prevRoom).emit('userList', {
        users: getUserInRoom(prevRoom)
      })
    }
    //join room
    socket.join(user.room)

    //TO user who joined
    socket.emit('message', buildMsg(ADMIN, `Yu have joined the ${user.room} chat room`))

    //To everyone else
      socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`));
    // Update User list for room
    io.to(user.room).emit('userList', {
      users: getUserInRoom(user.room)
    })

    //Update Rooms for everyone
    io.emit('roomList', {
      rooms: getAllActiveRooms()
    } )
  })

    // When User disconnects - to all others
  socket.on('disconnect' , ()=> {
    const user = getUser(socket.id)
    userLeavesApp(socket.id)

    if(user) {
      io.to(user.room).emit('message', buildMsg(ADMIN,`${user.name} has left the room`))

      io.to(user.room).emit('userList', {
        users: getUserInRoom(user.room)
      })
      io.emit('roomList' , {
        rooms: getAllActiveRooms()
      })
    }
    console.log(`User ${socket.id} disconnected`)
  })


  //Upon connection - to all users except the user
  socket.broadcast.emit('message',`User ${socket.id.substring(0,5)} connected` )

  // Listening for a message event
  socket.on("message", ({ name, text }) => {
    const room = getUser(socket.id)?.room
    if(room) {
      io.to(room).emit('message' , buildMsg(name, text));
    }
  });

  //Listen for activity
  socket.on('activity',(name)=>{
    const room = getUser(socket.id)?.room
    if(room) {
      socket.broadcast.to(room).emit('activity', name)
    }
    
  })

});

  function buildMsg(name, text){
    return {
      name,
      text,
      time : new Intl.DateTimeFormat('default', {
        hour: 'numeric',
        minutes: 'numeric',
        seconds: 'numeric'
      }). format(new Date)
    }
  }
// User functions
function activateUser(id, name, room) {
  const user = { id, name, room }
  UserState.setUsers([
    ...UserState.users.filter(user => user.id !== id),
    user 
  ])
  return user
}

function userLeavesApp(id) {
  UserState.setUsers([
    UserState.users.filter(user => user.id !== id)
  ])
}

function getUser(id) {
  return UserState.users.find(user => user.id == id)
}

function getUserInRoom(room){
  return UserState.users.filter(user=> user.room === room)
}

function getAllActiveRooms() {
  return Array.from(new Set(UserState.users.map(user => user.room)))
}