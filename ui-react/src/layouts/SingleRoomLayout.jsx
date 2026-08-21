import React from 'react';
import { useParams } from 'react-router-dom';

import Display from '../components/single-room/Display';
import NotFound from '../components/global/NotFound';

const SingleRoomLayout = () => {
  const { name: roomAlias } = useParams();

  return (
    <div id="single-room__wrap">
      { roomAlias ?
        <Display alias={roomAlias} />
      :
        <div id="error-wrap">
          <NotFound />
        </div>
      }
    </div>
  );
};

export default SingleRoomLayout;
