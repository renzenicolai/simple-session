"use strict";

/*

MIT License

Copyright (c) 2020 Renze Nicolai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

const { v4: uuidv4 } = require('uuid');

class Session {
    constructor() {
        // The unique identifier for this session
        this._id = uuidv4();
        
        // Unix timestamps for keeping track of the amount of seconds this session has been idle
        this._dateCreated = Math.floor(Date.now() / 1000);
        this._dateLastUsed = this._dateCreated;
        
        // User account associated with this session
        this._user = null;
        
        // Client currently connected to this session
        this._connection = null;
        
        // Push message subscriptions
        this._subscriptions = null;
    }
    
    getIdentifier() {
        // Returns the unique identifier of this session
        return this._id;
    }
    
    getId() {
        // Returns the unique identifier of this session
        process.emitWarning("getId is deprecated, please use getIdentifier", 'DeprecationWarning');
        return this._id;
    }
    
    getCreatedAt() {
        // Returns a unix timestamp representing the moment this session was created
        return this._dateCreated;
    }
    
    getUsedAt() {
        // Returns a unix timestamp representing the moment this session was last used
        return this._dateLastUsed;
    }
    
    use() {
        // Update the timestamp representing the moment this session was last used to the current time
        this._dateLastUsed = Math.floor(Date.now() / 1000);
    }
    
    getConnection() {
        return this._connection;
    }
    
    setConnection(connection) {
        this._connection = connection;
    }
    
    setUser(user) {
        this._user = user;
    }
    
    getUser() {
        return this._user;
    }
    
    serialize() {
        // Summary of the session
        return {
            id: this._id,
            user: this._user,
            dateCreated: this._dateCreated,
            dateLastUsed: this._dateLastUsed,
            subscriptions: this._subscriptions
        };
    }
    
    async push(subject, message) {
        let result = false;
        if (this._connection !== null) {
            this._connection.send(JSON.stringify({
                pushMessage: true,
                subject: subject,
                message: message
            }));
            result = true;
        }
        return result;
    }

    async pushIfSubscribed(subject, message) {
        let result = false;
        if (this._subscriptions.includes(subject)) {
            result = await this.push(subject, message);
        }
        return result;
    }

    async subscribe(subject) {
        let result = false;
        if (!this._subscriptions.includes(subject)) {
                this._subscriptions.push(subject);
                result = true;
        }
        return result;
    }

    async unsubscribe(subject) {
        this._subscriptions = this._subscriptions.filter(item => item !== subject);
        return true;
    }
    
    getSubscriptions() {
        return this._subscriptions;
    }
}

class SessionManager {
    constructor(opts={}) {
        this._opts = Object.assign({
            timeout: null
        }, opts);

        this.sessions = [];
        this.alwaysAllow = [];
        
        if (this._opts.timeout !== null) {
            setTimeout(this._gc.bind(this), 5000);
        }
    }
    
    /* Internal functions */
    
    _destroySession(id) {
        for (var i in this.sessions) {
            if (this.sessions[i].getIdentifier() === id) {
                this.sessions.splice(i,1);
                return true;
            }
        }
        return false;
    }
    
    _gc() {
        if (this._opts.timeout === null) {
            return;
        }
        
        var now = Math.floor((new Date()).getTime() / 1000);
        
        var sessionsToKeep = [];
        for (var i in this.sessions) {
            
            var id = this.sessions[i].getIdentifier();
            var unusedSince = now-this.sessions[i].getUsedAt();
            
            if (unusedSince < this._opts.timeout) {
                sessionsToKeep.push(this.sessions[i]);
            }
        }
        
        var oldAmount = this.sessions.length;
        var newAmount = sessionsToKeep.length;
        
        this.sessions = sessionsToKeep;
        
        // Reschedule the garbage collector
        setTimeout(this._gc.bind(this), 5000);
    }
    
    /* System functions */
    
    pushIfSubscribed(session, subject, message) {
        return session.pushIfSubscribed(subject, message);
    }

    push(session, subject, message) {
        return session.push(subject, message);
    }
    
    getSession(token) {
        for (var i in this.sessions) {
            if (this.sessions[i].getIdentifier()===token) {
                return this.sessions[i];
            }
        }
        return null;
    }

    getSessions() {
        return this.sessions;
    }
    
    /* RPC API functions: management of individual sessions */
    
    async createSession(session, params) {
        let newSession = new Session();
        this.sessions.push(newSession);
        return newSession.getIdentifier();
    }

    async destroyCurrentSession(session, params) {
        for (var i in this.sessions) {
            if (this.sessions[i] === session) {
                this.sessions.splice(i,1);
                return true;
            }
        }
        throw 'Session not found.';
    }
    
    async state(session, params) {
        if (session === null) {
            throw "no active session";
        }
        let user = session.getUser();
        return {
            user: user ? user.serialize() : null,
            permissions: user ? user.getPermissions() : []
        };
    }
    
    async listPermissionsForCurrentSession(session, params) {
        //Lists permissions for the active session
        if (session === null) {
            throw "no active session";
        }
        let permissions = user ? user.getPermissions() : [];
        return permissions;
    }
    
    async subscribe(session, params) {
        if (session === null) {
            throw "no active session";
        }
        if (typeof params === 'string') {
            let result = await session.subscribe(params);
            return result;
        } else {
            let promises = [];
            for (let i = 0; i < params.length; i++) {
                promises.push(session.subscribe(params[i]));
            }
            let result = await Promise.all(promises);
            return result;
        }
    }

    async unsubscribe(session, params) {
        if (session === null) {
            throw "no active session";
        }
        if (typeof params === 'string') {
            let result = await session.unsubscribe(params);
            return result;
        } else {
            let promises = [];
            for (let i = 0; i < params.length; i++) {
                promises.push(session.unsubscribe(params[i]));
            }
            let result = await Promise.all(promises);
            return result;
        }
    }
    
    /* RPC API functions: administrative tasks */
    
    async listSessions(session, params) {
        var sessionList = [];
        for (var i in this.sessions) {
            sessionList.push(this.sessions[i].serialize());
        }
        return sessionList;
    }

    async destroySession(session, params) {
        var result = this._destroySession(params);
        if (!result) {
            throw "Session not found";
        }
        return true;
    }

    registerRpcMethods(rpc, prefix="session") {
        if (prefix!=="") prefix = prefix + "/";
        
        /*
        * Create session
        * 
        * Returns a unique session token used to identify the session in further requests
        * 
        */
        rpc.addMethod(
            prefix+"create",
            this.createSession.bind(this),
            [
                {
                    type: "none"
                }
            ]
        );
        
        rpc.addAlwaysAllow(prefix+'create');
        
        /*
        * Destroy the current session
        * 
        * Destroys the session attached to the request
        * 
        */
        rpc.addMethod(
            prefix+"destroy",
            this.destroyCurrentSession.bind(this),
            [
                {
                    type: "none"
                }
            ]
        );
        
        /*
        * Query the state of the current session
        * 
        * Returns the state of the session attached to the request
        * 
        */
        rpc.addMethod(
            prefix+"state",
            this.state.bind(this),
            [
                {
                    type: "none"
                }
            ]
        );
        
        /*
        * Query permissions granted to the current session
        * 
        * Returns a list of permissions granted to the session attached to the request
        * 
        */
        rpc.addMethod(
            prefix+"permissions",
            this.listPermissionsForCurrentSession.bind(this),
            [
                {
                    type: "none"
                }
            ]
        );
        
        /* 
        * Pushmessages: subscribe to a topic
        *
        * Adds the supplied topic to the list of topics subscribed to of the session attached to the request
        * 
        */
        rpc.addMethod(
            prefix+"push/subscribe",
            this.subscribe.bind(this),
            [
                {
                    type: "string",
                    description: "Topic"
                },
                {
                    type: "array",
                    contains: "string",
                    description: "Array containing topics"
                }
            ]
        );
        
        /*
        * Pushmessages: unsubscribe from a topic
        * 
        * Removes the supplied topic to the list of topics subscribed to of the session attached to the request
        * 
        */
        rpc.addMethod(
            prefix+"push/unsubscribe",
            this.unsubscribe.bind(this),
            [
                {
                    type: "string",
                    description: "Topic"
                },
                {
                    type: "array",
                    contains: "string",
                    description: "Array containing topics"
                }
            ]
        );
        
        /*
        * Management: list all active sessions
        * 
        * Returns a list of sessions
        * 
        */
        rpc.addMethod(
            prefix+"management/list",
            this.listSessions.bind(this),
            [
                {
                    type: "none"
                }
            ]
        );
        
        /*
        * Management: destroy a session
        * 
        * Destroys the session corresponding to the supplied session token
        * 
        */
        rpc.addMethod(
            prefix+"management/destroy",
            this.destroySession.bind(this),
            [
                {
                    type: "string",
                    description: "Unique identifier of the session that will be destroyed"
                }
            ]
        );
    }
}

module.exports = SessionManager;
