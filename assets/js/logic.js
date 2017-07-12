// Initialize Firebase
let config = {
    apiKey: "AIzaSyDVYmCbd9MihsLrgiKOMwrV3oV1y60v_QY",
    authDomain: "flaxxchess.firebaseapp.com",
    databaseURL: "https://flaxxchess.firebaseio.com",
    projectId: "flaxxchess",
    storageBucket: "gs://flaxxproject.appspot.com/",
    messagingSenderId: "943450357741"
};
firebase.initializeApp(config);

const startPGN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const database = firebase.database();
let user,
    userRef,
    currRoom = 0,
    userStatus,
    chatroom,
    chat,
    chatUIRef,
    opponent;

function login() {
    let provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    firebase.auth().signInWithPopup(provider).then(function (result) {
        user = result.user;
        let updateStatus = database.ref("users/" + user.uid + "/status");
        updateStatus.set("online");
        updateStatus.onDisconnect().set("offline");
        $("#createRoom, #joinRoom, #restartButton, #playPC").prop("disabled", false);
        $("#login").prop("disabled", true);
        initChat(user);
        parseUser(user);
    });
}



function initChat(user) {
    let chatRef = firebase.database().ref("chat");

    chatUIRef = new FirechatUI(chatRef, document.getElementById("firechat-wrapper"));
    chat = new Firechat(chatRef);

    chatUIRef.setUser(user.uid, user.displayName);
}

function enterChat(room){
    let roomChat = database.ref("rooms/" + room + "/chat");
    roomChat.once("value", function(snapshot){
        if(!snapshot.exists()){
            chat.createRoom(room, "public", function(roomID){
                roomChat.set(roomID);
                chatroom = roomID;
                chat.enterRoom(chatroom);
                chatUIRef.focusTab(chatroom);
            });
        } else {
            chatroom = snapshot.val();
            chatUIRef.focusTab(chatroom);
        }
    });
}

function parseUser(user) {
    let usersData = database.ref('users');
    usersData.once('value', function (snapshot) {
        userRef = database.ref('users/' + user.uid);
        if (!snapshot.hasChild(user.uid)) {
            userRef.set({
                "uid": user.uid,
                "email": user.email,
                "name": user.displayName,
            });
        }
    });
}

function checkRoom(){
    if (currRoom !== 0){
        let playerCountRef = database.ref("rooms/" + currRoom + "/playerCount");
        playerCountRef.transaction(function(playerCount){
            return playerCount - 1;
        });
    }
}

function playAgainstPC(){
    let rooms = database.ref('rooms');
    let newRoom = rooms.push();
    newRoom.set({
        "player1" : user.uid,
        "player2": "pc",
        "pgn": startPGN,
        "currMove": "w",
        "playerCount": 2
    });
    opponent = "pc";
    currRoom = newRoom.key;

    checkRoom();

    let roomWatcher = database.ref("rooms/" + currRoom + "/pgn");
    roomWatcher.once("value", function(snapshot){
        genPCBoard(snapshot.val());
    });
}

function genPCBoard(pgn){
    game.load_pgn(pgn);
    cfg.position = game.fen();
    board = ChessBoard('board', Object.assign(cfg, pcCFG));
    updateStatus();
}

let makeRandomMove = function() {
    let possibleMoves = game.moves();

    // game over
    if (possibleMoves.length === 0) return;

    let randomIndex = Math.floor(Math.random() * possibleMoves.length);
    game.move(possibleMoves[randomIndex]);
    board.position(game.fen());
};

$("#login").on("click", function () {
    login();
});

$("#createRoom").on("click", function () {

    let rooms = database.ref('rooms');
    let newRoom = rooms.push();
    newRoom.set({
        "player1" : user.uid,
        "pgn": startPGN,
        "currMove": "w",
        "playerCount": 1
    });

    checkRoom();

    currRoom = newRoom.key;
    $("#dialog-message").dialog("open");
    $("#gameStatus").text("Waiting for Player 2.");
    $("#roomKey").text(currRoom);
    let playerCountRef = database.ref("rooms/" + currRoom + "/playerCount");
    playerCountRef.on("value", function(snapshot){
        if(snapshot.val() === 2){
            $("#dialog-message").dialog("close");
            let getOpponent = database.ref("rooms/" + currRoom + "/player2");
            getOpponent.once("value", function(snapshot){
                opponent = snapshot.val();
                setRoomWatcher();
            });
        }
    });

    userStatus = "w";
    enterChat(newRoom.key);
});

$("#joinRoom").on("click", function (){
    let roomID = $("#room").val();

    checkRoom();

    let room = database.ref("rooms/" + roomID);
    room.once('value').then(function (snapshot) {
        if (snapshot.exists()) {
            if(!snapshot.child("player2").exists()){
                userStatus = "b";
                room.child("player2").set(user.uid);
                opponent=snapshot.child("player1").val();
            } else if(snapshot.child("player1").val() === user.uid) {
                userStatus = "w";
                opponent=snapshot.child("player2").val();
            } else if(snapshot.child("player2").val() === user.uid){
                userStatus = "b";
                opponent=snapshot.child("player1").val();
            }
        } else {
            userStatus = "spectator";
        }
        currRoom = roomID;
        let playerCount = database.ref("rooms/" + currRoom + "/playerCount");

        playerCount.transaction(function(playerCount){
            return playerCount + 1;
        });

        playerCount.on("value", function(snapshot){
            if(snapshot.val() === 2){
                $("#dialog-message").dialog("close");
                setRoomWatcher();
            } else {
                $("#dialog-message").dialog("open");
                $("#gameStatus").text("Waiting for Player 2.");
                $("#roomKey").text(currRoom);
                setRoomWatcher();
            }
        });

        enterChat(roomID);
    });
});

$( function() {
    $( "#dialog-message" ).dialog({
        modal: true,
        autoOpen: false
    });
} );


let board,
    game = new Chess(),
    statusEl = $('#status'),
    fenEl = $('#fen'),
    cfg = {},
    pgnEl = $('#pgn');

function genBoard(pgn){
    game.load_pgn(pgn);
    cfg.position = game.fen();
    board = ChessBoard('board', Object.assign(cfg, cfg2));
    updateStatus();
}

function setRoomWatcher(){
    let roomWatcher = database.ref("rooms/" + currRoom);
    roomWatcher.once("value", function(snapshot){
        genBoard(snapshot.val().pgn);
        roomWatcher.on("value", function (snapshot) {
            updateBoard(snapshot.val().pgn);
        });
    });

    let opponentStatus = database.ref("users/" + opponent + "/status");

    opponentStatus.on("value", function(snapshot){
        if(snapshot.val() === "offline"){
            $("#dialog-message").dialog("open");
            $("#gameStatus").text("Waiting for Player 2");
            $("#roomKey").text(currRoom);
            let playerCount = database.ref("rooms/" + currRoom + "/playerCount");
            playerCount.transaction(function(playerCount){
                return playerCount - 1;
            });
        }
    });
}

function updateBoard(pgn) {
    game.load_pgn(pgn);
    board.position(game.fen());
    updateStatus();
}

let removeGreySquares = function () {
    $('#board .square-55d63').css('background', '');
};

let greySquare = function (square) {
    let squareEl = $('#board .square-' + square);

    let background = '#a9a9a9';
    if (squareEl.hasClass('black-3c85d') === true) {
        background = '#696969';
    }
    squareEl.css('background', background);
};


// do not pick up pieces if the game is over
// only pick up pieces for the side to move
let onDragStart = function (source, piece, position, orientation) {
    if (game.game_over() === true ||
        (game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
};

let onPCDragStart = function(source, piece, position, orientation) {
    if (game.in_checkmate() === true || game.in_draw() === true ||
        piece.search(/^b/) !== -1) {
        return false;
    }
};


let onDrop = function (source, target) {
    // see if the move is legal
    removeGreySquares();
    if(game.turn() !== userStatus){
        return;
    } else {
        let move = game.move({
            from: source,
            to: target,
            promotion: 'q' // NOTE: always promote to a queen for example simplicity
        });
        if (move === null) return 'snapback';
        // illegal move
        updateRoom();
    }
    updateStatus();
};

let onPCDrop =  function(source, target){
    removeGreySquares();
    let move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    });

    // illegal move
    if (move === null) return 'snapback';

    // make random legal move for black
    window.setTimeout(makeRandomMove, 250);
    //updateRoom();
    updateStatus();
};

function updateRoom(){
    let room = database.ref("rooms/" + currRoom);
    room.update({
        "pgn": game.pgn(),
        "currMove": game.turn()
    }).catch(function (error) {
        game.undo();
        alert("Spectators cannot make moves!");
    });

}

let onMouseoverSquare = function (square, piece) {
    // get list of possible moves for this square
    let moves = game.moves({
        square: square,
        verbose: true
    });

    // exit if there are no moves available for this square
    if (moves.length === 0) return;

    // highlight the square they moused over
    greySquare(square);

    // highlight the possible squares for this piece
    for (let i = 0; i < moves.length; i++) {
        greySquare(moves[i].to);
    }
};

let onMouseoutSquare = function (square, piece) {
    removeGreySquares();
};

// update the board position after the piece snap
// for castling, en passant, pawn promotion
let onSnapEnd = function () {
    board.position(game.fen());
};

let updateStatus = function () {
    let status = '';

    let moveColor = 'White';
    if (game.turn() === 'b') {
        moveColor = 'Black';
    }

    // checkmate?
    if (game.in_checkmate() === true) {
        status = 'Game over, ' + moveColor + ' is in checkmate.';
    }

    // draw?
    else if (game.in_draw() === true) {
        status = 'Game over, drawn position';
    }

    // game still on
    else {
        status = moveColor + ' to move';
        // check?
        if (game.in_check() === true) {
            status += ', ' + moveColor + ' is in check';
        }
    }
    statusEl.html(status);
    fenEl.html(game.fen());
    pgnEl.html(game.pgn());
};

$("#restartButton").on("click", function () {
    game.clear();
});

$("#playPC").click(function(){
   playAgainstPC();
});

let pcCFG = {
    draggable: true,
    onDragStart: onPCDragStart,
    onDrop: onPCDrop,
    onMouseoutSquare: onMouseoutSquare,
    onMouseoverSquare: onMouseoverSquare,
    onSnapEnd: onSnapEnd
};

let cfg2 = {
    draggable: true,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onMouseoutSquare: onMouseoutSquare,
    onMouseoverSquare: onMouseoverSquare,
    onSnapEnd: onSnapEnd
};