/*global define*/
define([
    './arrayRemoveDuplicates',
    './BoundingSphere',
    './Cartesian2',
    './Cartesian3',
    './ComponentDatatype',
    './defaultValue',
    './defined',
    './DeveloperError',
    './Ellipsoid',
    './Geometry',
    './GeometryAttribute',
    './GeometryAttributes',
    './IndexDatatype',
    './IntersectionTests',
    './Math',
    './Matrix3',
    './OrientedBoundingBox',
    './PolygonPipeline',
    './Ray',
    './Plane',
    './PrimitiveType',
    './VertexFormat',
    './WindingOrder'
], function(
    arrayRemoveDuplicates,
    BoundingSphere,
    Cartesian2,
    Cartesian3,
    ComponentDatatype,
    defaultValue,
    defined,
    DeveloperError,
    Ellipsoid,
    Geometry,
    GeometryAttribute,
    GeometryAttributes,
    IndexDatatype,
    IntersectionTests,
    CesiumMath,
    Matrix3,
    OrientedBoundingBox,
    PolygonPipeline,
    Ray,
    Plane,
    PrimitiveType,
    VertexFormat,
    WindingOrder) {
    'use strict';

    var intPoint = new Cartesian3();
    var xAxis = new Cartesian3();
    var yAxis = new Cartesian3();
    var zAxis = new Cartesian3();
    var origin = new Cartesian3();
    var normal = new Cartesian3();
    var ray = new Ray();
    var plane = new Plane(new Cartesian3(), 0);
    function projectTo2D(positions) {
        var positions2D = new Array(positions.length);
        var obb = OrientedBoundingBox.fromPoints(positions);
        var halfAxes = obb.halfAxes;
        Matrix3.getColumn(halfAxes, 0, xAxis);
        Matrix3.getColumn(halfAxes, 1, yAxis);
        Matrix3.getColumn(halfAxes, 2, zAxis);

        var xMag = Cartesian3.magnitude(xAxis);
        var yMag = Cartesian3.magnitude(yAxis);
        var zMag = Cartesian3.magnitude(zAxis);
        var min = Math.min(xMag, yMag, zMag);

        var center = obb.center;
        var planeXAxis;
        var planeYAxis;
        if (min === xMag) {
            Cartesian3.add(center, xAxis, origin);
            Cartesian3.normalize(xAxis, normal);
            planeXAxis = Cartesian3.normalize(yAxis, yAxis);
            planeYAxis = Cartesian3.normalize(zAxis, zAxis);
        } else if (min === yMag) {
            Cartesian3.add(center, yAxis, origin);
            Cartesian3.normalize(yAxis, normal);
            planeXAxis = Cartesian3.normalize(xAxis, xAxis);
            planeYAxis = Cartesian3.normalize(zAxis, zAxis);
        } else {
            Cartesian3.add(center, zAxis, origin);
            Cartesian3.normalize(zAxis, normal);
            planeXAxis = Cartesian3.normalize(xAxis, xAxis);
            planeYAxis = Cartesian3.normalize(yAxis, yAxis);
        }

        if (min === 0) {
            normal = Cartesian3.cross(planeXAxis, planeYAxis, normal);
            normal = Cartesian3.normalize(normal, normal);
        }

        Plane.fromPointNormal(origin, normal, plane);
        ray.direction = normal;

        for (var i = 0; i < positions.length; i++) {
            ray.origin = positions[i];

            var intersectionPoint = IntersectionTests.rayPlane(ray, plane, intPoint);

            if (!defined(intersectionPoint)) {
                Cartesian3.negate(ray.direction, ray.direction);
                intersectionPoint = IntersectionTests.rayPlane(ray, plane, intPoint);
            }
            var v = Cartesian3.subtract(intersectionPoint, origin, intersectionPoint);
            var x = Cartesian3.dot(planeXAxis, v);
            var y = Cartesian3.dot(planeYAxis, v);

            positions2D[i] = new Cartesian2(x, y);
        }

        return {
            positions: positions2D,
            normal: normal
        };
    }

    /**
     * A description of an ellipsoid centered at the origin.
     *
     * @alias EllipsoidGeometry
     * @constructor
     *
     * @param {Object} [options] Object with the following properties:
     * @param {Cartesian3} [options.radii=Cartesian3(1.0, 1.0, 1.0)] The radii of the ellipsoid in the x, y, and z directions.
     * @param {Number} [options.stackPartitions=64] The number of times to partition the ellipsoid into stacks.
     * @param {Number} [options.slicePartitions=64] The number of times to partition the ellipsoid into radial slices.
     * @param {VertexFormat} [options.vertexFormat=VertexFormat.DEFAULT] The vertex attributes to be computed.
     *
     * @exception {DeveloperError} options.slicePartitions cannot be less than three.
     * @exception {DeveloperError} options.stackPartitions cannot be less than three.
     *
     * @see EllipsoidGeometry#createGeometry
     *
     * @example
     * var ellipsoid = new Cesium.EllipsoidGeometry({
     *   vertexFormat : Cesium.VertexFormat.POSITION_ONLY,
     *   radii : new Cesium.Cartesian3(1000000.0, 500000.0, 500000.0)
     * });
     * var geometry = Cesium.EllipsoidGeometry.createGeometry(ellipsoid);
     */
    function SpacePolygonGeometry(options) {
        options = defaultValue(options, defaultValue.EMPTY_OBJECT);

        var vertexFormat = defaultValue(options.vertexFormat, VertexFormat.DEFAULT);
        this._vertexFormat = VertexFormat.clone(vertexFormat);
        this._workerName = 'createSpacePolygonGeometry';
    }

    /**
     * The number of elements used to pack the object into an array.
     * @type {Number}
     */
    SpacePolygonGeometry.packedLength = Cartesian3.packedLength + VertexFormat.packedLength + 2;

    /**
     * Stores the provided instance into the provided array.
     *
     * @param {EllipsoidGeometry} value The value to pack.
     * @param {Number[]} array The array to pack into.
     * @param {Number} [startingIndex=0] The index into the array at which to start packing the elements.
     */
    SpacePolygonGeometry.pack = function(value, array, startingIndex) {

    };

    SpacePolygonGeometry.unpack = function(array, startingIndex, result) {


    };

    SpacePolygonGeometry.createGeometry = function(spacePolygonGeometry) {
        var positions = spacePolygonGeometry.positions;
        positions = arrayRemoveDuplicates(positions, Cartesian3.equalsEpsilon, true);
        if (positions.length < 3) {
            return;
        }
        var bs = BoundingSphere.fromPoints(positions);

        var projectionResult = projectTo2D(positions);
        var positions2D = projectionResult.positions;
        var planeNormal = projectionResult.normal;
        var originalWindingOrder = PolygonPipeline.computeWindingOrder2D(positions2D);
        if (originalWindingOrder === WindingOrder.CLOCKWISE) {
            positions2D.reverse();
            positions = positions.slice().reverse();
        }

        var flatPositions = new Float64Array(positions.length * 3);
        var flatNormals = new Float32Array(flatPositions.length);
        var posIndex = 0;
        var normalIndex = 0;
        for (var i = 0; i < positions.length; i++) {
            flatPositions[posIndex++] = positions[i].x;
            flatPositions[posIndex++] = positions[i].y;
            flatPositions[posIndex++] = positions[i].z;

            flatNormals[normalIndex++] = planeNormal.x;
            flatNormals[normalIndex++] = planeNormal.y;
            flatNormals[normalIndex++] = planeNormal.z;
        }

        var indices = PolygonPipeline.triangulate(positions2D);
        if (indices.length < 3) {
            return;
        }
        var newIndices = IndexDatatype.createTypedArray(positions.length, indices.length);
        newIndices.set(indices);

        return new Geometry({
            attributes : new GeometryAttributes({
                position : new GeometryAttribute({
                    componentDatatype : ComponentDatatype.DOUBLE,
                    componentsPerAttribute : 3,
                    values : flatPositions
                }),
                normal: new GeometryAttribute({
                    componentDatatype : ComponentDatatype.FLOAT,
                    componentsPerAttribute : 3,
                    values : flatNormals
                })
            }),
            indices : newIndices,
            primitiveType : PrimitiveType.TRIANGLES,
            boundingSphere : bs
        });
    };

    return SpacePolygonGeometry;
});
