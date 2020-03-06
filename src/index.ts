interface IRequestMessage {
    id?: number;
    service: string;
    method: string
    params: any[];
}

interface IResponseError {
    message: string;
    stack?: string;
}

interface IResponseMessage {
    id: number;
    result?: any;
    error?: IResponseError;
}

type IMessage = IRequestMessage | IResponseMessage

export interface IService {
    [method: string]: (...args: any[]) => any | void | PromiseLike<any | void>
}

type PromiseOf<T> = T extends PromiseLike<infer R> ? Promise<R> : Promise<T>

interface IServiceClient<Service extends IService> {
    send<MethodName extends (keyof Service) & string>(method: MethodName, ...args: Parameters<Service[MethodName]>): void;
    call<
        MethodName extends (keyof Service) & string,
        ReturnValue = ReturnType<Service[MethodName]>
    >(method: MethodName, ...args: Parameters<Service[MethodName]>): PromiseOf<ReturnValue>
}

type MessageProducedFunction = (msg: IMessage) => void;
type RegisterRequestFunction =  (
    resolve: (response?: any) => void,
    reject: (error: IResponseError) => void
) => number;

class ServiceClient<Service extends IService> implements IServiceClient<Service> {
    private _messageProduced: MessageProducedFunction;
    private _name: string;
    private _registerRequest: RegisterRequestFunction;
    
    constructor(
        serviceName: string,
        messageProduced: MessageProducedFunction,
        registerRequest: RegisterRequestFunction
    ) {
        this._name = serviceName;
        this._messageProduced = messageProduced;
        this._registerRequest = registerRequest;
    }

    send<MethodName extends (keyof Service) & string>(method: MethodName, ...args: Parameters<Service[MethodName]>): void {
        this._messageProduced({
            service: this._name,
            method,
            params: args
        });
    }    
    
    call<MethodName extends (keyof Service) & string, ReturnValue = ReturnType<Service[MethodName]>>(method: MethodName, ...args: Parameters<Service[MethodName]>): PromiseOf<ReturnValue> {
        return new Promise((resolve, reject) => {
            const id = this._registerRequest(resolve, reject);
            this._messageProduced({
                id, service: this._name, method, params: args
            })
        }) as PromiseOf<ReturnValue>;
    }
}

export interface IServices {
    [name: string]: IService
}

export default class JSONTalk<Services extends IServices> {
    private readonly _messageProduced: MessageProducedFunction;
    private readonly _callRequestsById = new Map<number, {resolve: (response?: any) => void, reject: (error: IResponseError) => void}>();
    private _lastId = 0;
    private readonly _publishedServices: IServices;

    // connectService<ServiceName extends (keyof Services & string)>(serviceName: ServiceName): ServiceClient<Services[ServiceName]> {
    connectService<ServiceName extends (keyof Services & string)>(serviceName: ServiceName): ServiceClient<Services[ServiceName]> {
            return new ServiceClient<Services[ServiceName]>(serviceName, this._messageProduced, (resolve, reject) => {
            const id = this._lastId;
            this._lastId++;
            this._callRequestsById.set(id,  {resolve, reject});
            return id;
        });
    }

    feedMessage(msg: IMessage) {
        if ('service' in msg) { //It is a request message
            const resultPromise = (async () => {
                return await this._publishedServices[msg.service][msg.method](...msg.params)
            })();
            if (msg.id != null) {
                const message: IResponseMessage = { id: msg.id };
                resultPromise.then(result => {
                    if (result != undefined) message.result = result;
                    this._messageProduced(message);
                }, error => {
                    message.error = {
                        message: error.message || "Unknown Error",
                        stack: error.stack
                    }
                    this._messageProduced(message);
                });
            }
        }
        else { //It is a response message
            const { resolve, reject } = this._callRequestsById.get(msg.id)!;
            this._callRequestsById.delete(msg.id);
            if (msg.error != null) {
                reject(msg.error);
            }
            else {
                resolve(msg.result);
            }
        }
    }

    constructor(messageProduced: MessageProducedFunction, publishingServices: IServices) {
        this._messageProduced = messageProduced;
        this._publishedServices = publishingServices;
    }
}
