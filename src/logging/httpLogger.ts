import morgan from 'morgan';
import logger from './logger';

const format = ':method :url :status :res[content-length] - :response-time ms';

export const httpLogger = morgan(format, {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    },
  },
});

export default httpLogger;
