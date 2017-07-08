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
    currRoom,
    userStatus;

function login() {
    let provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    firebase.auth().signInWithPopup(provider).then(function (result) {
        let token = result.credential.accessToken;
        user = result.user;
        parseUser(user);
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

$("#login").on("click", function () {
    login();
});

$("#createRoom").on("click", function () {
    let rooms = database.ref('rooms');
    let newRoom = rooms.push();
    newRoom.set({
        "player1" : user.uid,
        "pgn": startPGN,
        "currMove": "white"
    });
    let userRoom = database.ref('users/' + user.uid + '/roomPermissions');
    userStatus = "white";
    userRoom.set([newRoom.key]);
    currRoom = newRoom.key;
    genBoard(startPGN);
});

$("#joinRoom").on("click", function () {
    let roomID = $("#room").val();
    console.log(roomID);

    let room = database.ref("rooms/" + roomID);
    room.once('value').then(function (snapshot) {
        if (snapshot.exists()) {
            console.log(snapshot);
            if(!snapshot.child("player2").exists()){
                currRoom = roomID;
                userStatus = "black";
                let newPlayer = database.ref("rooms/" + roomID + "/player2");
                newPlayer.set(user.uid);
            } else {
                currRoom = roomID;
            }
        } else {
            alert("Error: Room does not exist.");
        }
        
    });
});

let board,
    game = new Chess(),
    statusEl = $('#status'),
    fenEl = $('#fen'),
    cfg = {},
    pgnEl = $('#pgn');

function genBoard(pgn) {
    game.load_pgn(pgn);
    cfg.position = game.fen();
    board = ChessBoard('board', Object.assign(cfg, cfg2));

    updateStatus();
    updateBoard();
}

function updateBoard() {
    let updateBoard = database.ref("room/" + currRoom);
    updateBoard.on("value", function (snapshot) {
        game.load_pgn(snapshot.val().pgn);
        board.position(game.fen());
        updateStatus();
    });
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

let onDrop = function (source, target) {
    // see if the move is legal
    removeGreySquares();
    let move = game.move({
        from: source,
        to: target,
        promotion: 'q' // NOTE: always promote to a queen for example simplicity
    });

    // illegal move
    if (move === null) return 'snapback';

    updateStatus();
};


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

    let room = database.ref("rooms/"+currRoom);
    room.update({
        "pgn": game.pgn(),
        "currMove": game.turn()
    });
    statusEl.html(status);
    fenEl.html(game.fen());
    pgnEl.html(game.pgn());
};

$("#restartButton").on("click", function () {
    chess.clear();
});


let cfg2 = {
    draggable: true,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onMouseoutSquare: onMouseoutSquare,
    onMouseoverSquare: onMouseoverSquare,
    onSnapEnd: onSnapEnd
};

