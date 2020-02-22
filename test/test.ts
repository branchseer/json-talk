import { expect, use as chaiUse } from 'chai';
import JSONTalk, { IServices } from '../src';

import sinon = require('sinon');
import chaiAsPromised = require('chai-as-promised');

chaiUse(chaiAsPromised);

function makePeers<S extends IServices>(services: S): { clientSide: JSONTalk<S>, serviceSide: JSONTalk<{}> } {
    let serviceSide: JSONTalk<{}>;
    const clientSide = new JSONTalk<S>(msg => serviceSide.feedMessage(msg), { });
    serviceSide = new JSONTalk<{}>(msg => clientSide.feedMessage(msg), services);
    return { clientSide, serviceSide };
}

describe('JSONTalk', () => {
    describe('ServiceClient#send', () => {
        it('should send the args', () => {
            const methodImpl = sinon.fake();
            const { clientSide } = makePeers({
                aService: {
                    aMethod(str: string, arr: number[]) {
                        methodImpl(...arguments);
                    }
                }
            });

            clientSide.connectService('aService').send('aMethod', 'aString', [ 4,2,42 ]);
            expect(methodImpl.args).to.deep.equal([
                [ 'aString', [ 4,2,42 ] ]
            ]);
        });
    });

    describe('ServiceClient#call', () => {
        it('should send the args', () => {
            const methodImpl = sinon.fake();
            const { clientSide } = makePeers({
                aService: {
                    aMethod(str: object, bool: boolean) { methodImpl(...arguments); }
                }
            });

            clientSide.connectService('aService').send('aMethod', { prop: null }, true);
            expect(methodImpl.args).to.deep.equal([
                [{ prop: null }, true ]
            ]);
        });
    });

    describe('ServiceClient#call', () => {
        it('should send the args', async () => {
            const methodImpl = sinon.fake();
            const { clientSide } = makePeers({
                aService: {
                    aMethod(str: object, bool: boolean) { methodImpl(...arguments); }
                }
            });

            await clientSide.connectService('aService').call('aMethod', { prop: null }, true);
            expect(methodImpl.args).to.deep.equal([
                [{ prop: null }, true ]
            ]);
        });

        it('should return the Promise of the service method\'s returned value', async () => {
            const { clientSide } = makePeers({
                aService: {
                    aMethod: () => 2333
                }
            });
            
            const result = await clientSide.connectService('aService').call('aMethod');
            expect(result).to.equal(2333);
        });

        it('should return the Promise of the service method\'s returned promise\'s resolved value', async () => {
            const { clientSide } = makePeers({
                aService: {
                    aMethod: () => Promise.resolve({ hello: 'world', answer: 42 })
                }
            });
            const result = await clientSide.connectService('aService').call('aMethod');
            expect(result).to.deep.equal({ hello: 'world', answer: 42 });
        });

        it('should return a rejecting Promise with message of error that service method throws', async () => {
            const { clientSide } = makePeers({
                aService: {
                    aMethod() { throw new Error('error message'); }
                }
            });
            const resultPromise = clientSide.connectService('aService').call('aMethod');
            await expect(resultPromise).eventually.rejectedWith('error message')
        });

        it('should return a rejecting Promise with message of error that service method rejected with', async () => {
            const { clientSide } = makePeers({
                aService: {
                    aMethod: () => Promise.reject(new Error('rejected_error'))
                }
            });
            const resultPromise = clientSide.connectService('aService').call('aMethod');
            await expect(resultPromise).eventually.rejectedWith('rejected_error')
        });
    });
});
