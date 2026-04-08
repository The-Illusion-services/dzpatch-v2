import React from 'react';
import { View } from 'react-native';

const MapView = (props: any) => React.createElement(View, props);
const Marker = (props: any) => React.createElement(View, props);
const Polyline = (props: any) => React.createElement(View, props);
const Circle = (props: any) => React.createElement(View, props);
const Callout = (props: any) => React.createElement(View, props);

export default MapView;
export { Marker, Polyline, Circle, Callout };
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
